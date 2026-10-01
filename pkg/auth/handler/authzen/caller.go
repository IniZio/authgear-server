package authzen

import (
	"context"
	"errors"
	"net/http"
	"net/url"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	"github.com/authgear/authgear-server/pkg/lib/resourcescope"
	"github.com/authgear/authgear-server/pkg/lib/session"
)

const (
	SubjectTypeUser      = "user"
	ResourceTypeAuthgear = authz.ResourceTypeAuthgear
)

type CallerMode string

const (
	CallerModeClient CallerMode = "client"
	CallerModeSelf   CallerMode = "self"
)

type Caller struct {
	Mode     CallerMode
	ClientID string
	UserID   string
}

type ClientResourceQueries interface {
	GetClientResourceByURI(ctx context.Context, clientID string, uri string) (*resourcescope.Resource, error)
}

type CallerResolver struct {
	ClientResolver  oauth.OAuthClientResolver
	Credentials     *config.OAuthClientCredentials
	ClientResources ClientResourceQueries
	AgentGrants     authz.AgentGrantQueries
	Database        *appdb.Handle
}

func (r *CallerResolver) Resolve(ctx context.Context, req *http.Request) (*Caller, error) {
	username, password, hasBasic := req.BasicAuth()
	s := session.GetSession(ctx)

	switch {
	case hasBasic && s != nil:
		return nil, apierrors.NewUnauthorized("multiple credentials are not allowed")
	case hasBasic:
		return r.resolveClient(ctx, username, password)
	case s != nil:
		return r.resolveSelf(ctx, s)
	default:
		return nil, apierrors.NewUnauthorized("missing credentials")
	}
}

func (r *CallerResolver) resolveClient(ctx context.Context, username, password string) (*Caller, error) {
	invalid := apierrors.NewUnauthorized("invalid client credentials")

	// RFC 6749 Appendix B, same as the token endpoint.
	clientID, err := url.QueryUnescape(username)
	if err != nil {
		return nil, invalid
	}
	secret, err := url.QueryUnescape(password)
	if err != nil {
		return nil, invalid
	}

	client := r.ClientResolver.ResolveClient(ctx, clientID)
	if client == nil || client.ApplicationType != config.OAuthClientApplicationTypeM2M {
		return nil, invalid
	}
	if _, err := oauth.ValidateClientSecret(r.Credentials, clientID, secret); err != nil {
		return nil, invalid
	}
	return &Caller{Mode: CallerModeClient, ClientID: clientID}, nil
}

func (r *CallerResolver) resolveSelf(ctx context.Context, s session.ResolvedSession) (*Caller, error) {
	invalid := apierrors.NewUnauthorized("invalid access token")

	grant, ok := s.(*oauth.OfflineGrantSession)
	if !ok || grant.GetTokenType() != session.TokenTypeJWT {
		return nil, invalid
	}
	clientLike := oauth.SessionClientLike(ctx, s, r.ClientResolver)
	if !clientLike.IsFirstParty {
		return nil, invalid
	}
	return &Caller{
		Mode:     CallerModeSelf,
		ClientID: grant.ClientID,
		UserID:   s.GetAuthenticationInfo().UserID,
	}, nil
}

func (r *CallerResolver) collectGrantAudience(ctx context.Context, caller *Caller, er authz.EvaluationRequest, seen map[string]struct{}, uris []string) ([]string, error) {
	if caller.Mode != CallerModeClient {
		return nil, apierrors.NewForbidden("grant requests require client credentials")
	}
	grant, err := r.AgentGrants.GetAgentGrant(ctx, er.GrantID())
	if err != nil {
		return nil, err
	}
	// Unknown grant: the decision is false, not an error.
	if grant != nil {
		if _, ok := seen[grant.Audience]; !ok {
			seen[grant.Audience] = struct{}{}
			uris = append(uris, grant.Audience)
		}
	}
	return uris, nil
}

func (r *CallerResolver) AuthorizeRequest(ctx context.Context, caller *Caller, er authz.EvaluationRequest) error {
	return r.AuthorizeRequests(ctx, caller, []authz.EvaluationRequest{er})
}

// AuthorizeRequests checks every request. Client associations are looked up
// once per distinct resource URI, in a single read-only transaction.
func (r *CallerResolver) AuthorizeRequests(ctx context.Context, caller *Caller, ers []authz.EvaluationRequest) error {
	var uris []string
	var err error
	seen := map[string]struct{}{}
	for _, er := range ers {
		if er.Subject.Type != SubjectTypeUser {
			return apierrors.NewBadRequest("unsupported subject.type")
		}
		isGrant := er.IsGrantRequest()
		if er.Resource.Type != ResourceTypeAuthgear && !isGrant {
			return apierrors.NewBadRequest("unsupported resource.type")
		}
		if isGrant {
			uris, err = r.collectGrantAudience(ctx, caller, er, seen, uris)
			if err != nil {
				return err
			}
			continue
		}

		switch caller.Mode {
		case CallerModeClient:
			if _, ok := seen[er.Resource.ID]; !ok {
				seen[er.Resource.ID] = struct{}{}
				uris = append(uris, er.Resource.ID)
			}
		case CallerModeSelf:
			if er.Subject.ID != caller.UserID {
				return apierrors.NewForbidden("subject must be the token subject")
			}
		default:
			return apierrors.NewUnauthorized("unknown caller mode")
		}
	}

	if len(uris) == 0 {
		return nil
	}
	err = r.Database.ReadOnly(ctx, func(ctx context.Context) error {
		for _, uri := range uris {
			if _, err := r.ClientResources.GetClientResourceByURI(ctx, caller.ClientID, uri); err != nil {
				return err
			}
		}
		return nil
	})
	if errors.Is(err, resourcescope.ErrResourceNotFound) || errors.Is(err, resourcescope.ErrResourceNotAssociatedWithClient) {
		return apierrors.NewForbidden("resource is not associated with the client")
	}
	return err
}
