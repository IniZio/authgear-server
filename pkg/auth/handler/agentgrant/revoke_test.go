package agentgrant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	_ "github.com/mattn/go-sqlite3"
	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/config"
	dbinfra "github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis/appredis"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	oauthredis "github.com/authgear/authgear-server/pkg/lib/oauth/redis"
	"github.com/authgear/authgear-server/pkg/util/accesscontrol"
	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/authgear/authgear-server/pkg/util/httproute"
	"github.com/authgear/authgear-server/pkg/util/otelutil/oteldatabasesql"
)

type testPool struct{ connPool oteldatabasesql.ConnPool_ }

func (p *testPool) Open(info dbinfra.ConnectionInfo, opts dbinfra.ConnectionOptions) (oteldatabasesql.ConnPool_, error) {
	return p.connPool, nil
}
func (p *testPool) Close() error { return nil }

func newTestAppDBHandle() *appdb.Handle {
	connPool, err := oteldatabasesql.Open(oteldatabasesql.OpenOptions{DriverName: "sqlite3", DSN: ":memory:"})
	So(err, ShouldBeNil)
	connPool.SetMaxOpenConns(1)
	return &appdb.Handle{HookHandle: &dbinfra.HookHandle{Pool: &testPool{connPool: connPool}}}
}

type fakeClients map[string]*config.OAuthClientConfig

func (f fakeClients) ResolveClient(ctx context.Context, clientID string) *config.OAuthClientConfig {
	return f[clientID]
}

type fakeUsers struct{}

func (fakeUsers) Get(ctx context.Context, id string, role accesscontrol.Role) (*model.User, error) {
	return &model.User{}, nil
}

type fakeRoles struct{}

func (fakeRoles) ListEffectivePermissionsByUserID(ctx context.Context, userID string) ([]authz.Permission, error) {
	return nil, nil
}

type fakeResources struct{}

func (fakeResources) ResourceExists(ctx context.Context, uri string) (bool, error) { return false, nil }

type fakeVersions struct{}

func (fakeVersions) Get(ctx context.Context) (int64, error) { return 1, nil }

type fakeCache struct{}

func (fakeCache) Get(ctx context.Context, version int64, userID string) (*authz.PermissionSnapshot, bool, error) {
	return nil, false, nil
}
func (fakeCache) Set(ctx context.Context, version int64, userID string, snap *authz.PermissionSnapshot, ttl time.Duration) error {
	return nil
}

func TestRevokeHandler(t *testing.T) {
	Convey("RevokeHandler", t, func() {
		ctx := context.Background()
		now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		clk := clock.NewMockClockAtTime(now)

		mr := miniredis.RunT(t)
		maxOpen, maxIdle := 10, 5
		lifetime := config.DurationSeconds(60)
		store := &oauthredis.Store{
			Redis: &appredis.Handle{Handle: redis.NewHandle(redis.NewPool(), redis.ConnectionOptions{
				RedisURL:              "redis://" + mr.Addr(),
				MaxOpenConnection:     &maxOpen,
				MaxIdleConnection:     &maxIdle,
				IdleConnectionTimeout: &lifetime,
				MaxConnectionLifetime: &lifetime,
			})},
			AppID: "app-id",
			Clock: clk,
		}

		var creds config.OAuthClientCredentials
		// "c2VjcmV0" is base64url("secret").
		err := json.Unmarshal([]byte(`{"items":[
			{"client_id":"orch","keys":[{"kty":"oct","kid":"k1","k":"c2VjcmV0"}]},
			{"client_id":"other","keys":[{"kty":"oct","kid":"k2","k":"c2VjcmV0"}]}]}`), &creds)
		So(err, ShouldBeNil)

		h := &RevokeHandler{
			Clients: fakeClients{
				"orch":  {ClientID: "orch"},
				"other": {ClientID: "other"},
			},
			Credentials: &creds,
			Store:       store,
			Clock:       clk,
		}
		router := httproute.NewRouter()
		router.Add(ConfigureRevokeRoute(httproute.Route{}), h)

		grant := &oauth.AgentGrant{
			ID:       "g1",
			UserID:   "alice",
			ClientID: "orch",
			Actor:    "sbx",
			Audience: "https://gw",
			AuthorizationDetails: []oauth.AuthorizationDetail{
				{Type: "linear", Teams: []string{"ENG"}, Actions: []string{"issue:read"}},
			},
			CreatedAt: now,
			ExpireAt:  now.Add(15 * time.Minute),
		}
		So(store.CreateAgentGrant(ctx, grant), ShouldBeNil)

		do := func(id, user, pass string) int {
			r := httptest.NewRequest("DELETE", "/oauth2/agent_grants/"+id, nil)
			if user != "" {
				r.SetBasicAuth(user, pass)
			}
			w := httptest.NewRecorder()
			router.HTTPHandler().ServeHTTP(w, r)
			return w.Code
		}
		exists := func() bool {
			_, err := store.GetAgentGrant(ctx, "g1")
			return err == nil
		}

		Convey("other client gets 404 and the grant remains", func() {
			So(do("g1", "other", "secret"), ShouldEqual, http.StatusNotFound)
			So(exists(), ShouldBeTrue)
		})

		Convey("owner gets 204 and the grant is gone", func() {
			So(do("g1", "orch", "secret"), ShouldEqual, http.StatusNoContent)
			So(exists(), ShouldBeFalse)
			So(do("g1", "orch", "secret"), ShouldEqual, http.StatusNotFound)
		})

		Convey("bad credentials get 401", func() {
			So(do("g1", "", ""), ShouldEqual, http.StatusUnauthorized)
			So(do("g1", "orch", "wrong"), ShouldEqual, http.StatusUnauthorized)
			So(do("g1", "nobody", "secret"), ShouldEqual, http.StatusUnauthorized)
			So(exists(), ShouldBeTrue)
		})

		Convey("unknown grant gets 404", func() {
			So(do("missing", "orch", "secret"), ShouldEqual, http.StatusNotFound)
		})

		Convey("expired grant gets 404", func() {
			clk.AdvanceSeconds(16 * 60)
			So(do("g1", "orch", "secret"), ShouldEqual, http.StatusNotFound)
		})

		Convey("PDP decision turns false after revoke", func() {
			svc := &authz.Service{
				Database:    newTestAppDBHandle(),
				Users:       fakeUsers{},
				Roles:       fakeRoles{},
				Resources:   fakeResources{},
				AgentGrants: &oauthredis.AuthzAgentGrants{Store: store},
				Versions:    fakeVersions{},
				Cache:       fakeCache{},
				Clock:       clk,
			}
			eval := func() bool {
				d, _, err := svc.Evaluate(ctx, []authz.EvaluationRequest{{
					Subject:  authz.Subject{Type: "user", ID: "alice"},
					Resource: authz.Resource{Type: "linear:issue", ID: "ENG-1", Properties: map[string]any{"team": "ENG"}},
					Action:   authz.Action{Name: "issue:read"},
					Context:  map[string]any{"grant_id": "g1"},
				}}, authz.EvaluationsSemanticExecuteAll)
				So(err, ShouldBeNil)
				So(d, ShouldHaveLength, 1)
				return d[0]
			}

			So(eval(), ShouldBeTrue)
			So(do("g1", "orch", "secret"), ShouldEqual, http.StatusNoContent)
			So(eval(), ShouldBeFalse)
		})
	})
}
