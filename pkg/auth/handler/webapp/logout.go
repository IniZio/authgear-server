package webapp

import (
	"net/http"

	"github.com/gorilla/mux"

	"github.com/skygeario/skygear-server/pkg/auth/dependency/auth"
	"github.com/skygeario/skygear-server/pkg/auth/dependency/webapp"
	"github.com/skygeario/skygear-server/pkg/core/db"
	"github.com/skygeario/skygear-server/pkg/deps"
)

func AttachLogoutHandler(
	router *mux.Router,
	p *deps.RootProvider,
) {
	router.
		NewRoute().
		Path("/logout").
		Handler(p.Handler(newLogoutHandler))
}

type logoutSessionManager interface {
	Logout(auth.AuthSession, http.ResponseWriter) error
}

type LogoutHandler struct {
	RenderProvider webapp.RenderProvider
	SessionManager logoutSessionManager
	TxContext      db.TxContext
}

func (h *LogoutHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	db.WithTx(h.TxContext, func() error {
		if r.Method == "POST" && r.Form.Get("x_action") == "logout" {
			sess := auth.GetSession(r.Context())
			h.SessionManager.Logout(sess, w)
			webapp.RedirectToRedirectURI(w, r)
		} else {
			h.RenderProvider.WritePage(w, r, webapp.TemplateItemTypeAuthUILogoutHTML, nil)
		}
		return nil
	})
}
