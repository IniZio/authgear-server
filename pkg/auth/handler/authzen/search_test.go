package authzen

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/session"
	"github.com/authgear/authgear-server/pkg/util/accesscontrol"
	"github.com/authgear/authgear-server/pkg/util/clock"
)

type searchFakeUsers struct{}

func (searchFakeUsers) Get(ctx context.Context, id string, role accesscontrol.Role) (*model.User, error) {
	return &model.User{}, nil
}

type searchFakeRoles struct{}

func (searchFakeRoles) ListEffectivePermissionsByUserID(ctx context.Context, userID string) ([]authz.Permission, error) {
	return nil, nil
}

type searchFakeVersions struct{}

func (searchFakeVersions) Get(ctx context.Context) (int64, error) { return 1, nil }

type searchFakeCache struct{}

func (searchFakeCache) Get(ctx context.Context, version int64, userID string) (*authz.PermissionSnapshot, bool, error) {
	return nil, false, nil
}
func (searchFakeCache) Set(ctx context.Context, version int64, userID string, snap *authz.PermissionSnapshot, ttl time.Duration) error {
	return nil
}

func TestSearchResourceHandler(t *testing.T) {
	Convey("SearchResourceHandler", t, func() {
		now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		grants := fakeAgentGrants{
			"g1": {
				UserID: "u1", Audience: "https://api.example.com", ExpireAt: now.Add(time.Hour),
				Details: []authz.AgentGrantDetail{{Type: "linear", Teams: []string{"ENG", "FIN"}, Actions: []string{"issue:read"}}},
			},
			"g2": {UserID: "u1", Audience: "https://other.example.com", ExpireAt: now.Add(time.Hour)},
		}
		caller := newResolver()
		caller.AgentGrants = grants
		h := &SearchResourceHandler{
			Caller: caller,
			Authz: &authz.Service{
				Database:    newTestAppDBHandle(),
				Users:       searchFakeUsers{},
				Roles:       searchFakeRoles{},
				AgentGrants: grants,
				Versions:    searchFakeVersions{},
				Cache:       searchFakeCache{},
				Clock:       clock.NewMockClockAtTime(now),
			},
		}
		serve := func(withSession bool, body string) *httptest.ResponseRecorder {
			r := httptest.NewRequest("POST", "/", strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			if withSession {
				r = r.WithContext(session.WithSession(r.Context(), newJWTSession("spa", "u1", session.TokenTypeJWT)))
			} else {
				r.SetBasicAuth("m2m", "secret")
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			return w
		}
		body := func(resType, resExtra, ctxJSON string) string {
			return `{"subject":{"type":"user","id":"u1"},"resource":{"type":"` + resType + `"` + resExtra + `},` +
				`"action":{"name":"issue:read"},"context":` + ctxJSON + `}`
		}
		const okCtx = `{"grant_id":"g1"}`

		Convey("results", func() {
			w := serve(false, body("linear:team", "", okCtx))
			So(w.Code, ShouldEqual, http.StatusOK)
			var resp struct {
				Results []map[string]string `json:"results"`
			}
			So(json.Unmarshal(w.Body.Bytes(), &resp), ShouldBeNil)
			So(resp.Results, ShouldResemble, []map[string]string{
				{"type": "linear:team", "id": "ENG"},
				{"type": "linear:team", "id": "FIN"},
			})
		})
		Convey("unknown grant is empty", func() {
			w := serve(false, body("linear:team", "", `{"grant_id":"nope"}`))
			So(w.Code, ShouldEqual, http.StatusOK)
			So(strings.TrimSpace(w.Body.String()), ShouldEqual, `{"results":[]}`)
		})
		Convey("self mode", func() {
			So(serve(true, body("linear:team", "", okCtx)).Code, ShouldEqual, http.StatusForbidden)
		})
		Convey("unassociated audience", func() {
			So(serve(false, body("linear:team", "", `{"grant_id":"g2"}`)).Code, ShouldEqual, http.StatusForbidden)
		})
		Convey("authgear:resource", func() {
			So(serve(false, body("authgear:resource", "", okCtx)).Code, ShouldEqual, http.StatusBadRequest)
		})
		Convey("missing grant_id", func() {
			So(serve(false, body("linear:team", "", `{}`)).Code, ShouldEqual, http.StatusBadRequest)
		})
		Convey("resource.id set", func() {
			So(serve(false, body("linear:team", `,"id":"ENG"`, okCtx)).Code, ShouldEqual, http.StatusBadRequest)
		})
		Convey("no namespace", func() {
			So(serve(false, body("team", "", okCtx)).Code, ShouldEqual, http.StatusBadRequest)
		})
	})
}
