package authz

import (
	"context"
	"errors"
	"fmt"

	goredis "github.com/redis/go-redis/v9"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis/appredis"
	"github.com/authgear/authgear-server/pkg/util/slogutil"
)

var VersionLogger = slogutil.NewLogger("authz-version")

func versionKey(appID config.AppID) string {
	return fmt.Sprintf("app:%s:authz:version", appID)
}

// VersionStore holds the project-wide authorization version.
type VersionStore struct {
	Redis *appredis.Handle
	AppID config.AppID
}

// Get returns the current version; a missing key is 0.
func (s *VersionStore) Get(ctx context.Context) (int64, error) {
	var version int64
	err := s.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		v, err := conn.Get(ctx, versionKey(s.AppID)).Int64()
		if errors.Is(err, goredis.Nil) {
			return nil
		} else if err != nil {
			return err
		}
		version = v
		return nil
	})
	if err != nil {
		return 0, err
	}
	return version, nil
}

func (s *VersionStore) Bump(ctx context.Context) error {
	return s.Redis.WithConnContext(ctx, func(ctx context.Context, conn redis.Redis_6_0_Cmdable) error {
		return conn.Incr(ctx, versionKey(s.AppID)).Err()
	})
}

// CacheInvalidator schedules an authz version bump after the current transaction commits.
// Consumers depend on this interface, not the concrete Invalidator.
type CacheInvalidator interface {
	InvalidateAfterCommit(ctx context.Context)
}

type Invalidator struct {
	Database *appdb.Handle
	Versions *VersionStore
}

// InvalidateAfterCommit bumps the version once the current transaction commits.
func (i *Invalidator) InvalidateAfterCommit(ctx context.Context) {
	i.Database.UseHook(ctx, &bumpHook{Versions: i.Versions})
}

var _ CacheInvalidator = (*Invalidator)(nil)

type bumpHook struct {
	Versions *VersionStore
}

var _ db.TransactionHook = &bumpHook{}

func (h *bumpHook) WillCommitTx(ctx context.Context) error {
	return nil
}

// DidCommitTx cannot fail the request: the commit already happened.
func (h *bumpHook) DidCommitTx(ctx context.Context) {
	// The commit already happened; a cancelled request ctx must not skip the bump.
	ctx = context.WithoutCancel(ctx)
	if err := h.Versions.Bump(ctx); err != nil {
		VersionLogger.GetLogger(ctx).WithError(err).Warn(ctx, "failed to bump authz version")
	}
}
