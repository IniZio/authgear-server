package session

import (
	"net/http"
	"net/http/httptest"
	"testing"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/skygeario/skygear-server/pkg/auth/dependency/auth"
	"github.com/skygeario/skygear-server/pkg/core/authn"
	"github.com/skygeario/skygear-server/pkg/core/time"
	"github.com/skygeario/skygear-server/pkg/httputil"
)

type mockResolverProvider struct {
	Sessions []IDPSession
}

func (r *mockResolverProvider) GetByToken(token string) (*IDPSession, error) {
	for _, s := range r.Sessions {
		if s.TokenHash == token {
			return &s, nil
		}
	}
	return nil, ErrSessionNotFound
}

func (r *mockResolverProvider) Update(session *IDPSession) error {
	for i, s := range r.Sessions {
		if s.ID == session.ID {
			r.Sessions[i] = *session
			break
		}
	}
	return nil
}

func TestResolver(t *testing.T) {
	Convey("Resolver", t, func() {
		cookie := CookieDef{
			&httputil.CookieDef{
				Name:   CookieName,
				Path:   "/",
				Domain: "app.test",
				Secure: true,
				MaxAge: nil,
			},
		}
		provider := &mockResolverProvider{}
		provider.Sessions = []IDPSession{
			{
				ID: "session-id",
				Attrs: authn.Attrs{
					UserID: "user-id",
				},
				TokenHash: "token",
			},
		}

		resolver := Resolver{
			Cookie:   cookie,
			Provider: provider,
			Time:     &time.MockProvider{},
		}

		Convey("resolve without session cookie", func() {
			rw := httptest.NewRecorder()
			r, _ := http.NewRequest("POST", "/", nil)
			session, err := resolver.Resolve(rw, r)

			So(session, ShouldBeNil)
			So(err, ShouldBeNil)
			So(rw.Result().Cookies(), ShouldBeEmpty)
		})

		Convey("resolve with invalid session cookie", func() {
			rw := httptest.NewRecorder()
			r, _ := http.NewRequest("POST", "/", nil)
			r.AddCookie(&http.Cookie{Name: CookieName, Value: "invalid"})
			session, err := resolver.Resolve(rw, r)

			So(session, ShouldBeNil)
			So(err, ShouldBeError, auth.ErrInvalidSession)
			So(rw.Result().Cookies(), ShouldHaveLength, 1)
			So(rw.Result().Cookies()[0].Raw, ShouldEqual, "session=; Path=/; Domain=app.test; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax")
		})

		Convey("resolve with valid session cookie", func() {
			rw := httptest.NewRecorder()
			r, _ := http.NewRequest("POST", "/", nil)
			r.AddCookie(&http.Cookie{Name: CookieName, Value: "token"})
			session, err := resolver.Resolve(rw, r)

			So(session, ShouldNotBeNil)
			So(session.SessionID(), ShouldEqual, "session-id")
			So(err, ShouldBeNil)
			So(rw.Result().Cookies(), ShouldBeEmpty)
		})
	})
}
