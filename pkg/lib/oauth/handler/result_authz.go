package handler

import (
	"fmt"
	"net/http"
	"net/url"
	"sort"

	"github.com/authgear/authgear-server/pkg/lib/oauth"
	"github.com/authgear/authgear-server/pkg/lib/oauth/protocol"
	"github.com/authgear/authgear-server/pkg/util/httputil"
)

type (
	authorizationResultCode struct {
		RedirectURI  *url.URL
		ResponseMode string
		Response     protocol.AuthorizationResponse
		Cookies      []*http.Cookie
	}
	authorizationResultError struct {
		RedirectURI   *url.URL
		ResponseMode  string
		InternalError bool
		Response      protocol.ErrorResponse
		Cookies       []*http.Cookie
	}
)

func (a authorizationResultCode) WriteResponse(rw http.ResponseWriter, r *http.Request) {
	for _, cookie := range a.Cookies {
		httputil.UpdateCookie(rw, cookie)
	}
	oauth.WriteResponse(rw, r, a.RedirectURI, a.ResponseMode, a.Response)
}

func (a authorizationResultCode) IsInternalError() bool {
	return false
}

func (a authorizationResultError) WriteResponse(rw http.ResponseWriter, r *http.Request) {
	for _, cookie := range a.Cookies {
		httputil.UpdateCookie(rw, cookie)
	}
	if a.RedirectURI != nil {
		oauth.WriteResponse(rw, r, a.RedirectURI, a.ResponseMode, a.Response)
	} else {
		err := "Invalid OAuth authorization request:\n"
		keys := make([]string, 0, len(a.Response))
		for k := range a.Response {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for i, k := range keys {
			if i != 0 {
				err += "\n"
			}
			err += fmt.Sprintf("%s: %s", k, a.Response[k])
		}
		http.Error(rw, err, http.StatusBadRequest)
	}
}

func (a authorizationResultError) IsInternalError() bool {
	return a.InternalError
}
