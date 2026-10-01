package oauth_test

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis/appredis"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	oauthredis "github.com/authgear/authgear-server/pkg/lib/oauth/redis"
	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/authgear/authgear-server/pkg/util/duration"

	. "github.com/smartystreets/goconvey/convey"
)

func TestAgentGrantPermits(t *testing.T) {
	Convey("AgentGrant.Permits", t, func() {
		g := &oauth.AgentGrant{
			AuthorizationDetails: []oauth.AuthorizationDetail{
				{Type: "linear", Teams: []string{"ENG"}, Actions: []string{"issue:read", "comment:create"}},
			},
		}
		So(g.Permits("linear", "issue:read", "ENG"), ShouldBeTrue)
		So(g.Permits("linear", "issue:read", "OPS"), ShouldBeFalse)
		So(g.Permits("linear", "comment:delete", "ENG"), ShouldBeFalse)
		So(g.Permits("linear", "issue:read", ""), ShouldBeFalse)
		So(g.Permits("github", "issue:read", "ENG"), ShouldBeFalse)
	})
}

func TestAgentGrantStore(t *testing.T) {
	Convey("agent grant store", t, func() {
		mr := miniredis.RunT(t)
		secs := func(d time.Duration) *config.DurationSeconds {
			ds := config.DurationSeconds(d.Seconds())
			return &ds
		}
		maxOpen, maxIdle := 10, 5
		opts := redis.ConnectionOptions{
			RedisURL:              "redis://" + mr.Addr(),
			MaxOpenConnection:     &maxOpen,
			MaxIdleConnection:     &maxIdle,
			IdleConnectionTimeout: secs(duration.UserInteraction),
			MaxConnectionLifetime: secs(duration.UserInteraction),
		}
		clk := clock.NewMockClock()
		store := &oauthredis.Store{
			Redis: &appredis.Handle{Handle: redis.NewHandle(redis.NewPool(), opts)},
			AppID: config.AppID("app-id"),
			Clock: clk,
		}
		ctx := context.Background()

		grant := &oauth.AgentGrant{
			ID:       "grant-id",
			UserID:   "user-id",
			SID:      "sid",
			ClientID: "client-id",
			Actor:    "sandbox-1",
			Audience: "https://linear-gateway.localhost",
			AuthorizationDetails: []oauth.AuthorizationDetail{
				{Type: "linear", Teams: []string{"ENG"}, Actions: []string{"issue:read"}},
			},
			CreatedAt: clk.NowUTC(),
			ExpireAt:  clk.NowUTC().Add(time.Hour),
		}
		So(store.CreateAgentGrant(ctx, grant), ShouldBeNil)

		got, err := store.GetAgentGrant(ctx, "grant-id")
		So(err, ShouldBeNil)
		So(got, ShouldResemble, grant)
		So(got.Permits("linear", "issue:read", "ENG"), ShouldBeTrue)

		ttl := mr.TTL("app:app-id:agent-grant:grant-id")
		So(ttl, ShouldBeBetweenOrEqual, 59*time.Minute, time.Hour)

		So(store.DeleteAgentGrant(ctx, "grant-id"), ShouldBeNil)
		_, err = store.GetAgentGrant(ctx, "grant-id")
		So(err, ShouldBeError, oauth.ErrAgentGrantNotFound)
	})
}
