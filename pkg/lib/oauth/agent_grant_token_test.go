package oauth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"testing"
	"time"

	"github.com/golang/mock/gomock"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jws"
	"github.com/lestrrat-go/jwx/v2/jwt"
	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/util/clock"
)

func TestEncodeAgentGrantToken(t *testing.T) {
	Convey("EncodeAgentGrantToken", t, func() {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		now := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
		jwkSet, err := jwk.Parse([]byte(PrivateKeyPEM), jwk.WithPEM(true))
		So(err, ShouldBeNil)
		signingKey, _ := jwkSet.Key(0)
		_ = signingKey.Set(jwk.KeyIDKey, "kid-1")
		_ = signingKey.Set(jwk.AlgorithmKey, "RS256")

		issuer := NewMockIDTokenIssuer(ctrl)
		issuer.EXPECT().Iss().Return("http://accounts.example.com").AnyTimes()
		encoding := &AccessTokenEncoding{
			Secrets:       &config.OAuthKeyMaterials{Set: jwkSet},
			Clock:         clock.NewMockClockAtTime(now),
			IDTokenIssuer: issuer,
		}

		proofKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		So(err, ShouldBeNil)
		proofJWK, err := jwk.FromRaw(proofKey.Public())
		So(err, ShouldBeNil)
		digest, err := proofJWK.Thumbprint(crypto.SHA256)
		So(err, ShouldBeNil)
		jkt := base64.RawURLEncoding.EncodeToString(digest)

		grant := &AgentGrant{
			ID:        "grant-1",
			UserID:    "user-1",
			SID:       "sid-1",
			ClientID:  "orchestrator",
			Actor:     "sandbox-1",
			Audience:  "https://gateway.example.com/mcp",
			DPoPJKT:   jkt,
			CreatedAt: now,
			ExpireAt:  now.Add(15 * time.Minute),
			AuthorizationDetails: []AuthorizationDetail{
				{Type: "linear", Actions: []string{"issue:read"}, Teams: []string{"ENG"}},
			},
		}

		encoded, err := encoding.EncodeAgentGrantToken(context.Background(), grant)
		So(err, ShouldBeNil)

		pubSet, err := jwk.PublicSetOf(jwkSet)
		So(err, ShouldBeNil)
		tok, err := jwt.ParseString(encoded, jwt.WithKeySet(pubSet), jwt.WithValidate(false))
		So(err, ShouldBeNil)

		msg, err := jws.Parse([]byte(encoded))
		So(err, ShouldBeNil)
		So(msg.Signatures()[0].ProtectedHeaders().Type(), ShouldEqual, "at+jwt")
		So(msg.Signatures()[0].ProtectedHeaders().Algorithm(), ShouldEqual, jwa.RS256)

		So(tok.Issuer(), ShouldEqual, "http://accounts.example.com")
		So(tok.Audience(), ShouldResemble, []string{"https://gateway.example.com/mcp"})
		So(tok.Subject(), ShouldEqual, "user-1")
		So(tok.JwtID(), ShouldNotBeEmpty)
		So(tok.IssuedAt().Unix(), ShouldEqual, now.Unix())
		So(tok.Expiration().Sub(tok.IssuedAt()), ShouldBeLessThanOrEqualTo, 15*time.Minute)

		claims, err := tok.AsMap(context.Background())
		So(err, ShouldBeNil)
		So(claims["client_id"], ShouldEqual, "orchestrator")
		So(claims["grant_id"], ShouldEqual, "grant-1")
		So(claims["act"], ShouldResemble, map[string]any{"sub": "sandbox-1"})
		So(claims["cnf"], ShouldResemble, map[string]any{"jkt": jkt})
		So(claims["authorization_details"], ShouldResemble, []any{
			map[string]any{"type": "linear", "actions": []any{"issue:read"}, "teams": []any{"ENG"}},
		})
	})
}
