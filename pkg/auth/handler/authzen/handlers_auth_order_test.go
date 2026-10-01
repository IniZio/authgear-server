package authzen

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

func TestHandlersAuthenticateBeforeBodyValidation(t *testing.T) {
	Convey("handlers authenticate before validating the body", t, func() {
		caller := newResolver()
		handlers := map[string]http.Handler{
			"evaluation":  &EvaluationHandler{Caller: caller},
			"evaluations": &EvaluationsHandler{Caller: caller},
		}
		serve := func(h http.Handler, secret string, body string) int {
			r := httptest.NewRequest("POST", "/", strings.NewReader(body))
			r.SetBasicAuth("m2m", secret)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			return w.Code
		}

		for name, h := range handlers {
			Convey(name+": bad credentials, empty body", func() {
				So(serve(h, "wrong", ""), ShouldEqual, http.StatusUnauthorized)
			})
			Convey(name+": good credentials, invalid body", func() {
				So(serve(h, "secret", "{"), ShouldEqual, http.StatusBadRequest)
			})
		}
	})
}
