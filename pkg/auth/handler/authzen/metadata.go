package authzen

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/authgear/authgear-server/pkg/util/httproute"
)

func ConfigureMetadataRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("GET", "OPTIONS").
		WithPathPattern("/.well-known/authzen-configuration")
}

type MetadataEndpointsProvider interface {
	Origin() *url.URL
}

type MetadataHandler struct {
	Endpoints MetadataEndpointsProvider
}

func (h *MetadataHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	origin := h.Endpoints.Origin()
	meta := map[string]any{
		// Must equal the OIDC issuer.
		"policy_decision_point":       origin.String(),
		"access_evaluation_endpoint":  origin.JoinPath("access/v1/evaluation").String(),
		"access_evaluations_endpoint": origin.JoinPath("access/v1/evaluations").String(),
	}

	rw.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(rw).Encode(meta); err != nil {
		http.Error(rw, err.Error(), 500)
	}
}
