package webapp

import (
	"net/http"

	"github.com/authgear/authgear-server/pkg/lib/clientid"
	"github.com/authgear/authgear-server/pkg/util/httputil"
)

type ClientIDMiddleware struct {
	States            SessionMiddlewareStore
	SessionCookieDef  SessionCookieDef
	ClientIDCookieDef ClientIDCookieDef
	Cookies           CookieManager
}

func (m *ClientIDMiddleware) Handle(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientID, ok := m.ReadClientID(r)

		// Persist client_id into cookie.
		// So that client_id no longer need to be present on the query.
		if ok {
			cookie := m.Cookies.ValueCookie(m.ClientIDCookieDef.Def, clientID)
			httputil.UpdateCookie(w, cookie)
		}

		// Restore client_id into the request context.
		if clientID != "" {
			ctx := clientid.WithClientID(r.Context(), clientID)
			r = r.WithContext(ctx)
		}

		next.ServeHTTP(w, r)
	})
}

func (m *ClientIDMiddleware) ReadClientID(r *http.Request) (clientID string, ok bool) {
	// Read client_id in the following order.
	// 1. From query
	// 2. From client ID cookie
	q := r.URL.Query()
	clientID = q.Get("client_id")
	if clientID != "" {
		ok = true
		return
	}

	if cookie, err := m.Cookies.GetCookie(r, m.ClientIDCookieDef.Def); err == nil {
		clientID = cookie.Value
		ok = true
		return
	}

	return
}
