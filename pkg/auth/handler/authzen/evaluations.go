package authzen

import (
	"fmt"
	"net/http"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/util/httproute"
)

const MaxEvaluations = 100

func ConfigureEvaluationsRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("POST", "OPTIONS").
		WithPathPattern("/access/v1/evaluations")
}

type evaluationsRequest struct {
	evaluationItem
	Evaluations []evaluationItem `json:"evaluations"`
	Options     struct {
		EvaluationsSemantic string `json:"evaluations_semantic"`
	} `json:"options"`
}

func (b *evaluationsRequest) toRequests() ([]authz.EvaluationRequest, authz.EvaluationsSemantic, error) {
	semantic, ok := authz.ParseEvaluationsSemantic(b.Options.EvaluationsSemantic)
	if !ok {
		return nil, "", apierrors.NewBadRequest("invalid options.evaluations_semantic")
	}
	if len(b.Evaluations) == 0 {
		return nil, "", apierrors.NewBadRequest("evaluations is required")
	}
	if len(b.Evaluations) > MaxEvaluations {
		return nil, "", apierrors.NewBadRequest(fmt.Sprintf("evaluations must not exceed %d items", MaxEvaluations))
	}

	reqs := make([]authz.EvaluationRequest, 0, len(b.Evaluations))
	for i := range b.Evaluations {
		item := b.Evaluations[i]
		if item.Subject == nil {
			item.Subject = b.Subject
		}
		if item.Resource == nil {
			item.Resource = b.Resource
		}
		if item.Action == nil {
			item.Action = b.Action
		}
		if item.Context == nil {
			item.Context = b.Context
		}
		er, err := item.toRequest()
		if err != nil {
			return nil, "", err
		}
		reqs = append(reqs, er)
	}
	return reqs, semantic, nil
}

type EvaluationsHandler struct {
	Caller  *CallerResolver
	Authz   *authz.Service
	DevMode config.DevMode
}

func (h *EvaluationsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Authenticate first so bad credentials get 401 regardless of body validity.
	caller, err := h.Caller.Resolve(ctx, r)
	if err != nil {
		writeError(w, r, err)
		return
	}

	var body evaluationsRequest
	if err := decodeBody(w, r, &body); err != nil {
		writeError(w, r, err)
		return
	}
	reqs, semantic, err := body.toRequests()
	if err != nil {
		writeError(w, r, err)
		return
	}
	// Every item must pass before any is evaluated.
	if err := h.Caller.AuthorizeRequests(ctx, caller, reqs); err != nil {
		writeError(w, r, err)
		return
	}

	decisions, info, err := h.Authz.Evaluate(ctx, reqs, semantic)
	if err != nil {
		writeError(w, r, err)
		return
	}

	type decision struct {
		Decision bool `json:"decision"`
	}
	out := make([]decision, len(decisions))
	for i, d := range decisions {
		out[i] = decision{Decision: d}
	}

	writeDecisionHeaders(w, r, info, h.DevMode)
	writeJSON(w, struct {
		Evaluations []decision `json:"evaluations"`
	}{Evaluations: out})
}
