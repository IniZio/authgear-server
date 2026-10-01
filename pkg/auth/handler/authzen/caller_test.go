package authzen

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/config"
	dbinfra "github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	"github.com/authgear/authgear-server/pkg/lib/resourcescope"
	"github.com/authgear/authgear-server/pkg/lib/session"
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

type fakeClientResources struct{ associated map[string]bool }

func (f fakeClientResources) GetClientResourceByURI(ctx context.Context, clientID string, uri string) (*resourcescope.Resource, error) {
	if f.associated[clientID+"|"+uri] {
		return &resourcescope.Resource{}, nil
	}
	return nil, resourcescope.ErrResourceNotAssociatedWithClient
}

func newCredentials() *config.OAuthClientCredentials {
	// "c2VjcmV0" is base64url("secret").
	var c config.OAuthClientCredentials
	err := json.Unmarshal([]byte(`{"items":[{"client_id":"m2m","keys":[{"kty":"oct","kid":"k1","k":"c2VjcmV0"}]}]}`), &c)
	So(err, ShouldBeNil)
	return &c
}

func newJWTSession(clientID string, userID string, tokenType session.TokenType) *oauth.OfflineGrantSession {
	g := &oauth.OfflineGrant{}
	g.Attrs.UserID = userID
	return &oauth.OfflineGrantSession{OfflineGrant: g, ClientID: clientID, TokenType: tokenType}
}

func basicRequest(user, pass string) *http.Request {
	r := httptest.NewRequest("POST", "/access/v1/evaluation", nil)
	r.SetBasicAuth(user, pass)
	return r
}

func newResolver() *CallerResolver {
	return &CallerResolver{
		ClientResolver: fakeClients{
			"m2m":   {ClientID: "m2m", ApplicationType: config.OAuthClientApplicationTypeM2M},
			"spa":   {ClientID: "spa", ApplicationType: config.OAuthClientApplicationTypeSPA},
			"third": {ClientID: "third", ApplicationType: config.OAuthClientApplicationTypeThirdPartyApp},
		},
		Credentials:     newCredentials(),
		ClientResources: fakeClientResources{associated: map[string]bool{"m2m|https://api.example.com": true}},
		Database:        newTestAppDBHandle(),
	}
}

func shouldBeKind(name apierrors.Name) func(actual interface{}, expected ...interface{}) string {
	return func(actual interface{}, expected ...interface{}) string {
		err, _ := actual.(error)
		if err == nil || !apierrors.IsKind(err, name.WithReason(string(name))) {
			return "expected error of kind " + string(name)
		}
		return ""
	}
}

func TestCallerResolverResolve(t *testing.T) {
	Convey("CallerResolver.Resolve", t, func() {
		ctx := context.Background()
		r := newResolver()

		Convey("both credentials", func() {
			ctx := session.WithSession(ctx, newJWTSession("spa", "u1", session.TokenTypeJWT))
			_, err := r.Resolve(ctx, basicRequest("m2m", "secret"))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
		Convey("neither credentials", func() {
			_, err := r.Resolve(ctx, httptest.NewRequest("POST", "/", nil))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
		Convey("client mode ok, with escaped credentials", func() {
			c, err := r.Resolve(ctx, basicRequest("m2m", "secret"))
			So(err, ShouldBeNil)
			So(c, ShouldResemble, &Caller{Mode: CallerModeClient, ClientID: "m2m"})
		})
		Convey("non-m2m basic", func() {
			_, err := r.Resolve(ctx, basicRequest("spa", "secret"))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
		Convey("unknown client", func() {
			_, err := r.Resolve(ctx, basicRequest("nope", "secret"))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
		Convey("wrong secret", func() {
			_, err := r.Resolve(ctx, basicRequest("m2m", "wrong"))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
		Convey("self mode ok", func() {
			ctx := session.WithSession(ctx, newJWTSession("spa", "u1", session.TokenTypeJWT))
			c, err := r.Resolve(ctx, httptest.NewRequest("POST", "/", nil))
			So(err, ShouldBeNil)
			So(c, ShouldResemble, &Caller{Mode: CallerModeSelf, ClientID: "spa", UserID: "u1"})
		})
		Convey("third-party JWT", func() {
			ctx := session.WithSession(ctx, newJWTSession("third", "u1", session.TokenTypeJWT))
			_, err := r.Resolve(ctx, httptest.NewRequest("POST", "/", nil))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
		Convey("opaque token", func() {
			ctx := session.WithSession(ctx, newJWTSession("spa", "u1", session.TokenTypeOpaque))
			_, err := r.Resolve(ctx, httptest.NewRequest("POST", "/", nil))
			So(err, shouldBeKind(apierrors.Unauthorized))
		})
	})
}

func TestCallerResolverAuthorizeRequest(t *testing.T) {
	Convey("CallerResolver.AuthorizeRequest", t, func() {
		ctx := context.Background()
		r := newResolver()
		client := &Caller{Mode: CallerModeClient, ClientID: "m2m"}
		self := &Caller{Mode: CallerModeSelf, ClientID: "spa", UserID: "u1"}
		req := func(subjectType, subjectID, resourceType, resourceID string) authz.EvaluationRequest {
			return authz.EvaluationRequest{
				Subject:  authz.Subject{Type: subjectType, ID: subjectID},
				Resource: authz.Resource{Type: resourceType, ID: resourceID},
				Action:   authz.Action{Name: "read"},
			}
		}

		Convey("client mode associated resource", func() {
			So(r.AuthorizeRequest(ctx, client, req("user", "any", "authgear:resource", "https://api.example.com")), ShouldBeNil)
		})
		Convey("client mode unassociated resource", func() {
			err := r.AuthorizeRequest(ctx, client, req("user", "any", "authgear:resource", "https://other.example.com"))
			So(err, shouldBeKind(apierrors.Forbidden))
		})
		Convey("self mode own subject", func() {
			So(r.AuthorizeRequest(ctx, self, req("user", "u1", "authgear:resource", "https://api.example.com")), ShouldBeNil)
		})
		Convey("self mode subject mismatch", func() {
			err := r.AuthorizeRequest(ctx, self, req("user", "u2", "authgear:resource", "https://api.example.com"))
			So(err, shouldBeKind(apierrors.Forbidden))
		})
		Convey("bad subject type", func() {
			err := r.AuthorizeRequest(ctx, client, req("group", "g", "authgear:resource", "https://api.example.com"))
			So(err, shouldBeKind(apierrors.BadRequest))
		})
		Convey("bad resource type", func() {
			err := r.AuthorizeRequest(ctx, client, req("user", "u", "other", "https://api.example.com"))
			So(err, shouldBeKind(apierrors.BadRequest))
		})
	})
}

type countingClientResources struct{ calls map[string]int }

func (f *countingClientResources) GetClientResourceByURI(ctx context.Context, clientID string, uri string) (*resourcescope.Resource, error) {
	f.calls[uri]++
	if uri == "https://bad.example.com" {
		return nil, resourcescope.ErrResourceNotAssociatedWithClient
	}
	return &resourcescope.Resource{}, nil
}

func TestCallerResolverAuthorizeRequestsDedupe(t *testing.T) {
	Convey("CallerResolver.AuthorizeRequests dedupes resource lookups", t, func() {
		ctx := context.Background()
		counter := &countingClientResources{calls: map[string]int{}}
		r := newResolver()
		r.ClientResources = counter
		client := &Caller{Mode: CallerModeClient, ClientID: "m2m"}
		req := func(uri string) authz.EvaluationRequest {
			return authz.EvaluationRequest{
				Subject:  authz.Subject{Type: "user", ID: "u"},
				Resource: authz.Resource{Type: "authgear:resource", ID: uri},
				Action:   authz.Action{Name: "read"},
			}
		}

		err := r.AuthorizeRequests(ctx, client, []authz.EvaluationRequest{req("https://a"), req("https://a"), req("https://b"), req("https://a")})
		So(err, ShouldBeNil)
		So(counter.calls, ShouldResemble, map[string]int{"https://a": 1, "https://b": 1})

		err = r.AuthorizeRequests(ctx, client, []authz.EvaluationRequest{req("https://a"), req("https://bad.example.com")})
		So(err, shouldBeKind(apierrors.Forbidden))
	})
}
