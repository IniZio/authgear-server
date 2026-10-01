package redis

import (
	"context"
	"encoding/json"

	"github.com/authgear/authgear-server/pkg/lib/infra/redis"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
)

func (s *Store) CreateAgentGrant(ctx context.Context, grant *oauth.AgentGrant) error {
	return s.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		return s.save(ctx, conn, agentGrantKey(string(s.AppID), grant.ID), grant, grant.ExpireAt, true)
	})
}

func (s *Store) GetAgentGrant(ctx context.Context, id string) (*oauth.AgentGrant, error) {
	var g oauth.AgentGrant
	err := s.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		data, err := s.loadData(ctx, conn, agentGrantKey(string(s.AppID), id))
		if err == oauth.ErrGrantNotFound {
			return oauth.ErrAgentGrantNotFound
		} else if err != nil {
			return err
		}
		return json.Unmarshal(data, &g)
	})
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// DeleteAgentGrant is idempotent.
func (s *Store) DeleteAgentGrant(ctx context.Context, id string) error {
	return s.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		return s.del(ctx, conn, agentGrantKey(string(s.AppID), id))
	})
}
