package webapp

import (
	"net/http"

	"github.com/gorilla/mux"

	"github.com/skygeario/skygear-server/pkg/core/db"
	"github.com/skygeario/skygear-server/pkg/deps"
)

func AttachSignupHandler(
	router *mux.Router,
	p *deps.RootProvider,
) {
	router.
		NewRoute().
		Path("/signup").
		Methods("OPTIONS", "POST", "GET").
		Handler(p.Handler(newSignupHandler))
}

type signupProvider interface {
	GetCreateLoginIDForm(w http.ResponseWriter, r *http.Request) (func(error), error)
	CreateLoginID(w http.ResponseWriter, r *http.Request) (func(error), error)
	LoginIdentityProvider(w http.ResponseWriter, r *http.Request, providerAlias string) (func(error), error)
}

type SignupHandler struct {
	Provider  signupProvider
	TxContext db.TxContext
}

func (h *SignupHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	db.WithTx(h.TxContext, func() error {
		if r.Method == "GET" {
			writeResponse, err := h.Provider.GetCreateLoginIDForm(w, r)
			writeResponse(err)
			return err
		}

		if r.Method == "POST" {
			if r.Form.Get("x_idp_id") != "" {
				writeResponse, err := h.Provider.LoginIdentityProvider(w, r, r.Form.Get("x_idp_id"))
				writeResponse(err)
				return err
			}

			writeResponse, err := h.Provider.CreateLoginID(w, r)
			writeResponse(err)
			return err
		}

		return nil
	})
}
