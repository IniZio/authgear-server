package redis

import (
	"context"
	"errors"

	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
)

// AuthzAgentGrants adapts Store to authz.AgentGrantQueries.
type AuthzAgentGrants struct {
	Store *Store
}

func (a *AuthzAgentGrants) GetAgentGrant(ctx context.Context, id string) (*authz.AgentGrant, error) {
	g, err := a.Store.GetAgentGrant(ctx, id)
	if errors.Is(err, oauth.ErrAgentGrantNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &authz.AgentGrant{
		UserID:   g.UserID,
		Actor:    g.Actor,
		Audience: g.Audience,
		ExpireAt: g.ExpireAt,
		Permits:  g.Permits,
	}, nil
}
