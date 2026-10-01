package agentgrant

import (
	"context"
	"errors"
	"net/http"
	"net/url"

	"github.com/authgear/authgear-server/pkg/api"
	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	oauthredis "github.com/authgear/authgear-server/pkg/lib/oauth/redis"
	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/authgear/authgear-server/pkg/util/httproute"
	"github.com/authgear/authgear-server/pkg/util/httputil"
)

func ConfigureRevokeRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("DELETE").
		WithPathPattern("/oauth2/agent_grants/:id")
}

type RevokeStore interface {
	GetAgentGrant(ctx context.Context, id string) (*oauth.AgentGrant, error)
	DeleteAgentGrant(ctx context.Context, id string) error
}

var _ RevokeStore = (*oauthredis.Store)(nil)

type RevokeHandler struct {
	Clients     oauth.OAuthClientResolver
	Credentials *config.OAuthClientCredentials
	Store       RevokeStore
	Clock       clock.Clock
}

func (h *RevokeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	clientID, err := h.authenticate(ctx, r)
	if err != nil {
		writeError(w, r, err)
		return
	}

	notFound := apierrors.NewNotFound("agent grant not found")
	id := httproute.GetParam(r, "id")
	grant, err := h.Store.GetAgentGrant(ctx, id)
	if errors.Is(err, oauth.ErrAgentGrantNotFound) {
		writeError(w, r, notFound)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}
	if grant.ClientID != clientID || !h.Clock.NowUTC().Before(grant.ExpireAt) {
		writeError(w, r, notFound)
		return
	}

	if err := h.Store.DeleteAgentGrant(ctx, id); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RevokeHandler) authenticate(ctx context.Context, r *http.Request) (string, error) {
	invalid := apierrors.NewUnauthorized("invalid client credentials")
	username, password, ok := r.BasicAuth()
	if !ok {
		return "", apierrors.NewUnauthorized("missing client credentials")
	}

	// RFC 6749 Appendix B, same as the token endpoint.
	clientID, err := url.QueryUnescape(username)
	if err != nil {
		return "", invalid
	}
	secret, err := url.QueryUnescape(password)
	if err != nil {
		return "", invalid
	}

	if h.Clients.ResolveClient(ctx, clientID) == nil {
		return "", invalid
	}
	if _, err := oauth.ValidateClientSecret(h.Credentials, clientID, secret); err != nil {
		return "", invalid
	}
	return clientID, nil
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	httputil.WriteJSONResponse(r.Context(), w, &api.Response{Error: err})
}
