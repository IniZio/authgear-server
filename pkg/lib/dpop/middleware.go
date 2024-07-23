package dpop

import (
	"fmt"
	"net/http"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
)

type Middleware struct {
	DPoPProvider *Provider
}

func (m *Middleware) Handle(next http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		dpopHeader := r.Header.Values("DPoP")
		if len(dpopHeader) == 0 {
			next.ServeHTTP(rw, r)
			return
		}
		// https://datatracker.ietf.org/doc/html/rfc9449#name-checking-dpop-proofs
		// Check there is not more than one DPoP HTTP request header field
		if len(dpopHeader) > 1 {
			http.Error(rw, "multiple DPoP headers are not allowed", http.StatusBadRequest)
			return
		}
		dpopJwt := dpopHeader[0]
		proof, err := m.DPoPProvider.ParseProof(dpopJwt)
		if err != nil {
			m.handleError(rw, err)
			return
		}

		if err := m.DPoPProvider.CompareHTM(proof, r.Method); err != nil {
			m.handleError(rw, err)
			return
		}

		if err := m.DPoPProvider.CompareHTU(proof, r.URL); err != nil {
			m.handleError(rw, err)
			return
		}

		WithDPoPProof(r.Context(), proof)

	})
}

func (m *Middleware) handleError(rw http.ResponseWriter, err error) {
	if apierrors.IsAPIError(err) {
		apierr := apierrors.AsAPIError(err)
		http.Error(rw, fmt.Sprintf("%s:%s", apierr.Reason, apierr.Message), apierr.Name.HTTPStatus())
		return
	} else {
		panic(err)
	}
}
