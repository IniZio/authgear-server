package authzen

import (
	"net/http"
	"strings"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/util/httproute"
)

func ConfigureSearchResourceRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("POST", "OPTIONS").
		WithPathPattern("/access/v1/search/resource")
}

type searchResourceBody struct {
	Subject *struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"subject"`
	Resource *struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"resource"`
	Action *struct {
		Name string `json:"name"`
	} `json:"action"`
	Context map[string]any `json:"context"`
}

func (b *searchResourceBody) toRequest() (authz.EvaluationRequest, error) {
	if b.Subject == nil || b.Subject.Type == "" || b.Subject.ID == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("subject.type and subject.id are required")
	}
	if err := validateSubjectID(b.Subject.ID); err != nil {
		return authz.EvaluationRequest{}, err
	}
	if b.Resource == nil || b.Resource.Type == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("resource.type is required")
	}
	if b.Resource.ID != "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("resource.id must not be set")
	}
	namespace, _, _ := strings.Cut(b.Resource.Type, ":")
	if b.Resource.Type == ResourceTypeAuthgear || namespace == "" || namespace == b.Resource.Type {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("unsupported resource.type")
	}
	if b.Action == nil || b.Action.Name == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("action.name is required")
	}
	if id, _ := b.Context[authz.ContextKeyGrantID].(string); id == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("context.grant_id is required")
	}
	return authz.EvaluationRequest{
		Subject:  authz.Subject{Type: b.Subject.Type, ID: b.Subject.ID},
		Resource: authz.Resource{Type: b.Resource.Type},
		Action:   authz.Action{Name: b.Action.Name},
		Context:  b.Context,
	}, nil
}

type searchResourceResult struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type SearchResourceHandler struct {
	Caller *CallerResolver
	Authz  *authz.Service
}

func (h *SearchResourceHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	caller, err := h.Caller.Resolve(ctx, r)
	if err != nil {
		writeError(w, r, err)
		return
	}

	var body searchResourceBody
	if err := decodeBody(w, r, &body); err != nil {
		writeError(w, r, err)
		return
	}
	er, err := body.toRequest()
	if err != nil {
		writeError(w, r, err)
		return
	}
	if err := h.Caller.AuthorizeRequest(ctx, caller, er); err != nil {
		writeError(w, r, err)
		return
	}

	teams, err := h.Authz.SearchGrantTeams(ctx, er)
	if err != nil {
		writeError(w, r, err)
		return
	}
	results := make([]searchResourceResult, 0, len(teams))
	for _, t := range teams {
		results = append(results, searchResourceResult{Type: er.Resource.Type, ID: t})
	}
	if id := r.Header.Get("X-Request-ID"); id != "" {
		w.Header().Set("X-Request-ID", id)
	}
	writeJSON(w, struct {
		Results []searchResourceResult `json:"results"`
	}{Results: results})
}
