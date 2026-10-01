package authzen

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/lib/authz"
)

func TestEvaluationItemSubjectIDCap(t *testing.T) {
	Convey("toRequest subject.id cap", t, func() {
		mk := func(id string) *evaluationItem {
			item := &evaluationItem{}
			item.Subject = &struct {
				Type string `json:"type"`
				ID   string `json:"id"`
			}{"user", id}
			item.Resource = &struct {
				Type string `json:"type"`
				ID   string `json:"id"`
			}{"r", "1"}
			item.Action = &struct {
				Name string `json:"name"`
			}{"a"}
			return item
		}
		_, err := mk(strings.Repeat("a", maxSubjectIDLength)).toRequest()
		So(err, ShouldBeNil)
		_, err = mk(strings.Repeat("a", maxSubjectIDLength+1)).toRequest()
		So(err, ShouldNotBeNil)
	})
}

func TestWriteDecisionHeaders(t *testing.T) {
	Convey("Server-Timing desc only in dev mode", t, func() {
		info := authz.EvaluationInfo{CacheHit: true, Elapsed: 5 * time.Millisecond}
		r := httptest.NewRequest("POST", "/", nil)

		w := httptest.NewRecorder()
		writeDecisionHeaders(w, r, info, false)
		So(w.Header().Get("Server-Timing"), ShouldEqual, "pdp;dur=5.00")

		w = httptest.NewRecorder()
		writeDecisionHeaders(w, r, info, true)
		So(w.Header().Get("Server-Timing"), ShouldEqual, `pdp;dur=5.00;desc="cache-hit"`)
	})
}
