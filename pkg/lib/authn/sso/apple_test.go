package sso

import (
	"testing"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/api/oauthrelyingparty"
	"github.com/authgear/authgear-server/pkg/lib/oauthrelyingparty/apple"
)

func TestAppleImpl(t *testing.T) {
	Convey("AppleImpl", t, func() {
		g := &AppleImpl{
			ProviderConfig: oauthrelyingparty.ProviderConfig{
				"client_id": "client_id",
				"type":      apple.Type,
			},
			HTTPClient: OAuthHTTPClient{},
		}

		u, err := g.GetAuthorizationURL(GetAuthorizationURLOptions{
			RedirectURI:  "https://localhost/",
			ResponseMode: oauthrelyingparty.ResponseModeFormPost,
			Nonce:        "nonce",
			State:        "state",
			Prompt:       []string{"login"},
		})
		So(err, ShouldBeNil)
		So(u, ShouldEqual, "https://appleid.apple.com/auth/authorize?client_id=client_id&nonce=nonce&redirect_uri=https%3A%2F%2Flocalhost%2F&response_mode=form_post&response_type=code&scope=name+email&state=state")
	})
}
