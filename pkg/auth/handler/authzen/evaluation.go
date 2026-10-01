package authzen

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/authgear/authgear-server/pkg/api"
	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/util/httproute"
	"github.com/authgear/authgear-server/pkg/util/httputil"
)

func ConfigureEvaluationRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("POST", "OPTIONS").
		WithPathPattern("/access/v1/evaluation")
}

const maxSubjectIDLength = 400

func validateSubjectID(id string) error {
	if len(id) > maxSubjectIDLength {
		return apierrors.NewBadRequest(fmt.Sprintf("subject.id must be at most %d characters", maxSubjectIDLength))
	}
	return nil
}

// Unknown JSON fields are accepted, as AuthZEN allows.
type evaluationItem struct {
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

// toRequest returns a 400 error when a required field is missing.
func (i *evaluationItem) toRequest() (authz.EvaluationRequest, error) {
	if i.Subject == nil || i.Subject.Type == "" || i.Subject.ID == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("subject.type and subject.id are required")
	}
	if err := validateSubjectID(i.Subject.ID); err != nil {
		return authz.EvaluationRequest{}, err
	}
	if i.Resource == nil || i.Resource.Type == "" || i.Resource.ID == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("resource.type and resource.id are required")
	}
	if i.Action == nil || i.Action.Name == "" {
		return authz.EvaluationRequest{}, apierrors.NewBadRequest("action.name is required")
	}
	return authz.EvaluationRequest{
		Subject:  authz.Subject{Type: i.Subject.Type, ID: i.Subject.ID},
		Resource: authz.Resource{Type: i.Resource.Type, ID: i.Resource.ID},
		Action:   authz.Action{Name: i.Action.Name},
		Context:  i.Context,
	}, nil
}

func decodeBody(w http.ResponseWriter, r *http.Request, payload any) error {
	return httputil.ParseJSONBody(r, w, func(reader io.Reader, v any) error {
		if err := json.NewDecoder(reader).Decode(v); err != nil {
			var maxBytesError *http.MaxBytesError
			if errors.As(err, &maxBytesError) {
				return err
			}
			return apierrors.NewBadRequest(fmt.Sprintf("invalid request body: %v", err))
		}
		return nil
	}, payload)
}

// writeDecisionHeaders echoes X-Request-ID and sets Server-Timing; it adds the cache state only in dev mode,
// as it would leak cache state across clients otherwise.
func writeDecisionHeaders(w http.ResponseWriter, r *http.Request, info authz.EvaluationInfo, devMode config.DevMode) {
	if id := r.Header.Get("X-Request-ID"); id != "" {
		w.Header().Set("X-Request-ID", id)
	}
	timing := fmt.Sprintf("pdp;dur=%d", info.Elapsed.Milliseconds())
	if devMode {
		desc := "cache-miss"
		if info.CacheHit {
			desc = "cache-hit"
		}
		timing += fmt.Sprintf(";desc=\"%s\"", desc)
	}
	w.Header().Set("Server-Timing", timing)
}

func writeJSON(w http.ResponseWriter, body any) {
	b, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(b); err != nil {
		panic(err)
	}
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	if id := r.Header.Get("X-Request-ID"); id != "" {
		w.Header().Set("X-Request-ID", id)
	}
	httputil.WriteJSONResponse(r.Context(), w, &api.Response{Error: err})
}

type EvaluationHandler struct {
	Caller  *CallerResolver
	Authz   *authz.Service
	DevMode config.DevMode
}

func (h *EvaluationHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var item evaluationItem
	if err := decodeBody(w, r, &item); err != nil {
		writeError(w, r, err)
		return
	}
	er, err := item.toRequest()
	if err != nil {
		writeError(w, r, err)
		return
	}

	caller, err := h.Caller.Resolve(ctx, r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if err := h.Caller.AuthorizeRequest(ctx, caller, er); err != nil {
		writeError(w, r, err)
		return
	}

	decisions, info, err := h.Authz.Evaluate(ctx, []authz.EvaluationRequest{er}, authz.EvaluationsSemanticExecuteAll)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if len(decisions) != 1 {
		writeError(w, r, fmt.Errorf("unexpected decision count: %d", len(decisions)))
		return
	}

	writeDecisionHeaders(w, r, info, h.DevMode)
	writeJSON(w, struct {
		Decision bool `json:"decision"`
	}{Decision: decisions[0]})
}
