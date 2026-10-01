package authz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis/appredis"
)

const permissionCacheTTL = time.Hour

// PermissionSnapshot is a user's effective permissions; Grants are "resourceID scope".
type PermissionSnapshot struct {
	Disabled bool     `json:"disabled"`
	Grants   []string `json:"grants"`
}

func permissionKey(appID config.AppID, version int64, userID string) string {
	return fmt.Sprintf("app:%s:authz:perm:%d:%s", appID, version, userID)
}

type PermissionCache struct {
	Redis *appredis.Handle
	AppID config.AppID
}

// Get reports whether the snapshot was found.
func (c *PermissionCache) Get(ctx context.Context, version int64, userID string) (*PermissionSnapshot, bool, error) {
	var snap *PermissionSnapshot
	err := c.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		data, err := conn.Get(ctx, permissionKey(c.AppID, version, userID)).Bytes()
		if errors.Is(err, goredis.Nil) {
			return nil
		} else if err != nil {
			return err
		}
		var s PermissionSnapshot
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		snap = &s
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return snap, snap != nil, nil
}

func (c *PermissionCache) Set(ctx context.Context, version int64, userID string, snap *PermissionSnapshot) error {
	data, err := json.Marshal(snap)
	if err != nil {
		return err
	}
	return c.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		return conn.Set(ctx, permissionKey(c.AppID, version, userID), data, permissionCacheTTL).Err()
	})
}
