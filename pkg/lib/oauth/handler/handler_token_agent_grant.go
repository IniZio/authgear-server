package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/dpop"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	"github.com/authgear/authgear-server/pkg/lib/oauth/protocol"
	"github.com/authgear/authgear-server/pkg/lib/resourcescope"
	"github.com/authgear/authgear-server/pkg/util/uuid"
)

const (
	// nolint:gosec
	AgentGrantTokenType = "urn:authgear:params:oauth:token-type:agent-grant"
	// nolint:gosec
	SandboxIDTokenType = "urn:authgear:params:oauth:token-type:sandbox-id"

	AgentGrantLifetime       = 15 * time.Minute
	agentGrantMaxActorLength = 400
)

func parseAgentGrantAuthorizationDetails(raw string) ([]oauth.AuthorizationDetail, error) {
	if raw == "" {
		return nil, protocol.NewError("invalid_request", "authorization_details is required")
	}
	var details []oauth.AuthorizationDetail
	if err := json.Unmarshal([]byte(raw), &details); err != nil {
		return nil, protocol.NewError("invalid_request", "authorization_details must be a JSON array of objects")
	}
	if len(details) == 0 {
		return nil, protocol.NewError("invalid_request", "authorization_details must not be empty")
	}
	for _, d := range details {
		if d.Type == "" || len(d.Actions) == 0 || len(d.Teams) == 0 {
			return nil, protocol.NewError("invalid_request", "each authorization_details object requires type, non-empty actions and non-empty teams")
		}
	}
	return details, nil
}

func (h *TokenHandler) handleAgentGrantTokenExchange(
	ctx context.Context,
	client *config.OAuthClientConfig,
	r protocol.TokenRequest,
) (*HandleResult, error) {
	// A public client has no secret to validate. Otherwise authenticate first,
	// so unauthorized_client is only reachable by an authenticated client.
	if !client.IsConfidential() {
		return nil, protocol.NewError("unauthorized_client", "the client is not allowed to use the agent grant exchange")
	}
	if _, err := h.validateClientSecret(client, r.ClientSecret()); err != nil {
		return nil, protocol.NewError("invalid_client", "invalid client secret")
	}
	if !client.AgentGrantExchangeEnabled {
		return nil, protocol.NewError("unauthorized_client", "the client is not allowed to use the agent grant exchange")
	}

	// Required even if the client sets x_dpop_disabled.
	proof, err := dpop.GetDPoPProof(ctx).Get()
	if err != nil {
		return nil, err
	}
	if proof == nil {
		return nil, protocol.NewError(dpop.InvalidDPoPProof, "DPoP proof is required")
	}

	if r.SubjectTokenType() != IDTokenTokenType {
		return nil, protocol.NewError("invalid_request", fmt.Sprintf("expected subject_token_type = %v", IDTokenTokenType))
	}
	if r.SubjectToken() == "" {
		return nil, protocol.NewError("invalid_request", "subject_token is required")
	}
	if r.ActorTokenType() != SandboxIDTokenType {
		return nil, protocol.NewError("invalid_request", fmt.Sprintf("expected actor_token_type = %v", SandboxIDTokenType))
	}
	if r.ActorToken() == "" {
		return nil, protocol.NewError("invalid_request", "actor_token is required")
	}
	if len(r.ActorToken()) > agentGrantMaxActorLength {
		return nil, protocol.NewError("invalid_request", fmt.Sprintf("actor_token must be at most %d characters", agentGrantMaxActorLength))
	}
	resources := url.Values(r)["resource"]
	if len(resources) != 1 || resources[0] == "" {
		return nil, protocol.NewError("invalid_request", "exactly one resource is required")
	}
	details, err := parseAgentGrantAuthorizationDetails(url.Values(r).Get("authorization_details"))
	if err != nil {
		return nil, err
	}

	idToken, err := h.IDTokenIssuer.VerifyIDToken(r.SubjectToken())
	if err != nil {
		return nil, protocol.NewError("invalid_grant", "subject_token is not a valid id token")
	}
	sess, ok, err := h.resolveIDTokenSession(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if !ok || sess == nil {
		return nil, protocol.NewError("invalid_grant", "sid in id token (subject_token) is invalid")
	}
	sid, _ := idToken.Get(string(model.ClaimSID))
	sidStr, _ := sid.(string)

	resource, err := h.ResourceAccessPolicyService.GetResourceByURI(ctx, resources[0], client)
	if err != nil {
		if errors.Is(err, resourcescope.ErrResourceNotFound) {
			return nil, errResourceNotAvailable()
		}
		return nil, err
	}

	now := h.Clock.NowUTC()
	grant := &oauth.AgentGrant{
		ID:                   uuid.New(),
		UserID:               sess.GetAuthenticationInfo().UserID,
		SID:                  sidStr,
		ClientID:             client.ClientID,
		Actor:                r.ActorToken(),
		Audience:             resource.ResourceURI,
		AuthorizationDetails: details,
		DPoPJKT:              proof.JKT,
		CreatedAt:            now,
		ExpireAt:             now.Add(AgentGrantLifetime),
	}
	if err := h.AgentGrants.CreateAgentGrant(ctx, grant); err != nil {
		return nil, err
	}

	token, err := h.AccessTokenEncoding.EncodeAgentGrantToken(ctx, grant)
	if err != nil {
		return nil, err
	}

	resp := protocol.TokenResponse{}
	resp.AccessToken(token)
	resp.IssuedTokenType(AgentGrantTokenType)
	resp.TokenType("DPoP")
	resp.ExpiresIn(int(AgentGrantLifetime / time.Second))
	resp["authorization_details"] = details
	return &HandleResult{Response: resp}, nil
}
