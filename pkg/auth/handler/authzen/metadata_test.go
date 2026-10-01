package authzen

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

type fakeEndpoints struct{ origin *url.URL }

func (f fakeEndpoints) Origin() *url.URL { return f.origin }

func TestMetadataHandler(t *testing.T) {
	Convey("MetadataHandler advertises resource search", t, func() {
		origin, _ := url.Parse("https://myapp.authgear.cloud")
		h := &MetadataHandler{Endpoints: fakeEndpoints{origin}}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		var meta map[string]string
		So(json.Unmarshal(w.Body.Bytes(), &meta), ShouldBeNil)
		So(meta["search_resource_endpoint"], ShouldEqual, "https://myapp.authgear.cloud/access/v1/search/resource")
	})
}
