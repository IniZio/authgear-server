package webapp

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/util/duration"
	"github.com/authgear/authgear-server/pkg/util/httputil"
)

type CookieManager interface {
	GetCookie(r *http.Request, def *httputil.CookieDef) (*http.Cookie, error)
	ValueCookie(def *httputil.CookieDef, value string) *http.Cookie
	ClearCookie(def *httputil.CookieDef) *http.Cookie
}

type SessionCookieDef struct {
	Def *httputil.CookieDef
}

func NewSessionCookieDef() SessionCookieDef {
	def := &httputil.CookieDef{
		NameSuffix:        "web_session",
		Path:              "/",
		AllowScriptAccess: false,
		SameSite:          http.SameSiteNoneMode, // For resumption after redirecting from OAuth providers
		MaxAge:            nil,                   // Use HTTP session cookie; expires when browser closes
	}
	return SessionCookieDef{Def: def}
}

type ErrorCookieDef struct {
	Def *httputil.CookieDef
}

func NewErrorCookieDef() ErrorCookieDef {
	def := &httputil.CookieDef{
		NameSuffix:        "web_err",
		Path:              "/",
		AllowScriptAccess: false,
		SameSite:          http.SameSiteLaxMode,
		MaxAge:            nil, // Use HTTP session cookie; expires when browser closes
	}
	return ErrorCookieDef{Def: def}
}

type SignedUpCookieDef struct {
	Def *httputil.CookieDef
}

func NewSignedUpCookieDef() SignedUpCookieDef {
	long := int(duration.Long.Seconds())
	def := &httputil.CookieDef{
		NameSuffix:        "signed_up",
		Path:              "/",
		AllowScriptAccess: false,
		SameSite:          http.SameSiteLaxMode,
		MaxAge:            &long,
	}
	return SignedUpCookieDef{Def: def}
}

type ErrorState struct {
	Form  url.Values
	Error *apierrors.APIError
}

type ErrorCookie struct {
	Cookie  ErrorCookieDef
	Cookies CookieManager
}

func (c *ErrorCookie) GetError(r *http.Request) (*ErrorState, bool) {
	cookie, err := c.Cookies.GetCookie(r, c.Cookie.Def)
	if err != nil || cookie.Value == "" {
		return nil, false
	}

	data, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return nil, false
	}

	var errorState ErrorState
	if err := json.Unmarshal(data, &errorState); err != nil {
		return nil, false
	}
	return &errorState, true
}

func (c *ErrorCookie) ResetError() *http.Cookie {
	cookie := c.Cookies.ClearCookie(c.Cookie.Def)
	return cookie
}

func (c *ErrorCookie) SetError(r *http.Request, value *apierrors.APIError) (*http.Cookie, error) {
	data, err := json.Marshal(&ErrorState{
		Form:  r.Form,
		Error: value,
	})
	if err != nil {
		return nil, err
	}

	cookieValue := base64.RawURLEncoding.EncodeToString(data)
	cookie := c.Cookies.ValueCookie(c.Cookie.Def, cookieValue)
	return cookie, nil
}
