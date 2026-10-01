package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	gomock "github.com/golang/mock/gomock"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/dpop"
	"github.com/authgear/authgear-server/pkg/lib/oauth"
	"github.com/authgear/authgear-server/pkg/lib/oauth/handler"
	"github.com/authgear/authgear-server/pkg/lib/oauth/protocol"
	"github.com/authgear/authgear-server/pkg/lib/resourcescope"
	"github.com/authgear/authgear-server/pkg/lib/session"
	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/authgear/authgear-server/pkg/util/httputil"
)

func jwtWithSID(sid string) jwt.Token {
	tok := jwt.New()
	if sid != "" {
		_ = tok.Set("sid", sid)
	}
	return tok
}

func TestTokenHandlerAgentGrant(t *testing.T) {
	Convey("Token handler agent grant exchange", t, func() {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		origin := "http://accounts.example.com"
		idTokenIssuer := NewMockIDTokenIssuer(ctrl)
		idTokenIssuer.EXPECT().Iss().Return(origin).AnyTimes()
		appDB := NewMockTokenHandlerAppDatabase(ctrl)
		appDB.EXPECT().WithTx(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
		).AnyTimes()
		rateLimiter := NewMockTokenHandlerRateLimiter(ctrl)
		rateLimiter.EXPECT().Allow(gomock.Any(), gomock.Any()).Return(nil, nil).AnyTimes()
		offlineGrantService := NewMockTokenHandlerOfflineGrantService(ctrl)
		resourceAccessPolicyService := NewMockResourceAccessPolicyService(ctrl)
		accessTokenEncoding := NewMockTokenHandlerAccessTokenEncoding(ctrl)
		agentGrants := NewMockTokenHandlerAgentGrantStore(ctrl)
		events := NewMockEventService(ctrl)
		events.EXPECT().WillDeliverBlockingEvent(gomock.Any()).AnyTimes().Return(false)
		clk := clock.NewMockClockAt("2020-02-01T00:00:00Z")

		clientResolver := &multiClientResolver{ClientConfigs: map[string]*config.OAuthClientConfig{}}
		secret, err := jwk.FromRaw([]byte("orchestrator-secret"))
		So(err, ShouldBeNil)
		keySet := jwk.NewSet()
		_ = keySet.AddKey(secret)

		h := handler.TokenHandler{
			Database:   appDB,
			AppID:      config.AppID("testapp"),
			HTTPProto:  "http",
			HTTPOrigin: httputil.HTTPOrigin(origin),
			Clock:      clk,
			RemoteIP:   "1.2.3.4",
			OAuthClientCredentials: &config.OAuthClientCredentials{
				Items: []config.OAuthClientCredentialsItem{{
					ClientID:                     "orchestrator",
					OAuthClientCredentialsKeySet: config.OAuthClientCredentialsKeySet{Set: keySet},
				}},
			},
			ClientResolver:              clientResolver,
			IDTokenIssuer:               idTokenIssuer,
			OfflineGrantService:         offlineGrantService,
			ResourceAccessPolicyService: resourceAccessPolicyService,
			AccessTokenEncoding:         accessTokenEncoding,
			AgentGrants:                 agentGrants,
			RateLimiter:                 rateLimiter,
			Events:                      events,
		}

		clientResolver.ClientConfigs["orchestrator"] = &config.OAuthClientConfig{
			ClientID:                  "orchestrator",
			ApplicationType:           config.OAuthClientApplicationTypeConfidential,
			AgentGrantExchangeEnabled: true,
			RedirectURIs:              []string{"https://example.com/"},
		}

		proofCtx := func() context.Context {
			return dpop.WithDPoPProof(context.Background(), &dpop.DPoPProof{JKT: "proof-jkt"})
		}
		details := `[{"type":"linear","actions":["issue:read"],"teams":["ENG"]}]`
		newRequest := func() protocol.TokenRequest {
			return protocol.TokenRequest{
				"grant_type":            []string{oauth.TokenExchangeGrantType},
				"client_id":             []string{"orchestrator"},
				"client_secret":         []string{"orchestrator-secret"},
				"requested_token_type":  []string{handler.AgentGrantTokenType},
				"subject_token_type":    []string{handler.IDTokenTokenType},
				"subject_token":         []string{"id-token"},
				"actor_token_type":      []string{handler.SandboxIDTokenType},
				"actor_token":           []string{"sandbox-1"},
				"resource":              []string{"https://gateway.example.com/mcp"},
				"authorization_details": []string{details},
			}
		}
		sid := oauth.EncodeSIDByRawValues(session.TypeOfflineGrant, "offline-1")
		offlineGrant := &oauth.OfflineGrant{ID: "offline-1", Attrs: *session.NewAttrs("user-id")}
		okIDToken := func() {
			tok := jwtWithSID(sid)
			idTokenIssuer.EXPECT().VerifyIDToken("id-token").Return(tok, nil)
		}
		okResource := func() {
			resourceAccessPolicyService.EXPECT().GetResourceByURI(gomock.Any(), "https://gateway.example.com/mcp", gomock.Any()).
				Return(&resourcescope.Resource{ID: "res-1", ResourceURI: "https://gateway.example.com/mcp"}, nil)
		}

		call := func(ctx context.Context, r protocol.TokenRequest) (int, map[string]any) {
			req, _ := http.NewRequest("POST", "/token", nil)
			result := h.Handle(ctx, &httptest.ResponseRecorder{}, req, r)
			resp := httptest.NewRecorder()
			result.WriteResponse(resp, req)
			var body map[string]any
			_ = json.Unmarshal(resp.Body.Bytes(), &body)
			return resp.Result().StatusCode, body
		}
		expectError := func(ctx context.Context, r protocol.TokenRequest, code string) {
			status, body := call(ctx, r)
			So(status, ShouldEqual, 400)
			So(body["error"], ShouldEqual, code)
		}

		Convey("success", func() {
			r := newRequest()
			okIDToken()
			okResource()
			offlineGrantService.EXPECT().GetOfflineGrant(gomock.Any(), "offline-1").Return(offlineGrant, nil)
			var stored *oauth.AgentGrant
			agentGrants.EXPECT().CreateAgentGrant(gomock.Any(), gomock.Any()).DoAndReturn(
				func(ctx context.Context, g *oauth.AgentGrant) error {
					stored = g
					return nil
				})
			accessTokenEncoding.EXPECT().EncodeAgentGrantToken(gomock.Any(), gomock.Any()).DoAndReturn(
				func(ctx context.Context, g *oauth.AgentGrant) (string, error) {
					So(g, ShouldEqual, stored)
					return "grant-token", nil
				})

			status, body := call(proofCtx(), r)
			So(status, ShouldEqual, 200)
			So(body["access_token"], ShouldEqual, "grant-token")
			So(body["issued_token_type"], ShouldEqual, handler.AgentGrantTokenType)
			So(body["token_type"], ShouldEqual, "DPoP")
			So(body["expires_in"], ShouldEqual, 900)
			So(body["authorization_details"], ShouldResemble, []any{
				map[string]any{"type": "linear", "actions": []any{"issue:read"}, "teams": []any{"ENG"}},
			})

			So(stored.ID, ShouldNotBeEmpty)
			So(stored.UserID, ShouldEqual, "user-id")
			So(stored.SID, ShouldEqual, sid)
			So(stored.ClientID, ShouldEqual, "orchestrator")
			So(stored.Actor, ShouldEqual, "sandbox-1")
			So(stored.Audience, ShouldEqual, "https://gateway.example.com/mcp")
			So(stored.DPoPJKT, ShouldEqual, "proof-jkt")
			So(stored.ExpireAt.Sub(stored.CreatedAt), ShouldEqual, 15*time.Minute)
		})

		Convey("x_dpop_disabled does not waive the proof", func() {
			clientResolver.ClientConfigs["orchestrator"].DPoPDisabled = true
			expectError(context.Background(), newRequest(), "invalid_dpop_proof")
		})

		Convey("client without the flag", func() {
			clientResolver.ClientConfigs["orchestrator"].AgentGrantExchangeEnabled = false
			expectError(proofCtx(), newRequest(), "unauthorized_client")
		})

		Convey("client not confidential", func() {
			clientResolver.ClientConfigs["orchestrator"].ApplicationType = config.OAuthClientApplicationTypeSPA
			expectError(proofCtx(), newRequest(), "unauthorized_client")
		})

		Convey("wrong client secret", func() {
			r := newRequest()
			r["client_secret"] = []string{"wrong"}
			expectError(proofCtx(), r, "invalid_client")
		})

		Convey("wrong client secret is rejected before the flag check", func() {
			clientResolver.ClientConfigs["orchestrator"].AgentGrantExchangeEnabled = false
			r := newRequest()
			r["client_secret"] = []string{"wrong"}
			expectError(proofCtx(), r, "invalid_client")
		})

		Convey("no DPoP proof", func() {
			expectError(context.Background(), newRequest(), "invalid_dpop_proof")
		})

		Convey("invalid DPoP proof", func() {
			ctx := dpop.WithDPoPProof(context.Background(), &dpop.InvalidDPoPProofWithError{Error: dpop.ErrInvalidJwt})
			expectError(ctx, newRequest(), "invalid_dpop_proof")
		})

		Convey("invalid_request", func() {
			cases := map[string]func(r protocol.TokenRequest){
				"missing subject_token":          func(r protocol.TokenRequest) { delete(r, "subject_token") },
				"wrong subject_token_type":       func(r protocol.TokenRequest) { r["subject_token_type"] = []string{"x"} },
				"wrong actor_token_type":         func(r protocol.TokenRequest) { r["actor_token_type"] = []string{"x"} },
				"missing actor_token":            func(r protocol.TokenRequest) { delete(r, "actor_token") },
				"actor_token too long":           func(r protocol.TokenRequest) { r["actor_token"] = []string{string(make([]byte, 401))} },
				"missing resource":               func(r protocol.TokenRequest) { delete(r, "resource") },
				"two resources":                  func(r protocol.TokenRequest) { r["resource"] = []string{"a", "b"} },
				"missing authorization_details":  func(r protocol.TokenRequest) { delete(r, "authorization_details") },
				"authorization_details not json": func(r protocol.TokenRequest) { r["authorization_details"] = []string{"{"} },
				"authorization_details object":   func(r protocol.TokenRequest) { r["authorization_details"] = []string{`{"type":"linear"}`} },
				"authorization_details empty":    func(r protocol.TokenRequest) { r["authorization_details"] = []string{`[]`} },
				"missing type": func(r protocol.TokenRequest) {
					r["authorization_details"] = []string{`[{"actions":["a"],"teams":["ENG"]}]`}
				},
				"empty actions": func(r protocol.TokenRequest) {
					r["authorization_details"] = []string{`[{"type":"linear","actions":[],"teams":["ENG"]}]`}
				},
				"empty teams": func(r protocol.TokenRequest) {
					r["authorization_details"] = []string{`[{"type":"linear","actions":["a"]}]`}
				},
			}
			for _, mutate := range cases {
				r := newRequest()
				mutate(r)
				expectError(proofCtx(), r, "invalid_request")
			}
		})

		Convey("invalid subject_token", func() {
			idTokenIssuer.EXPECT().VerifyIDToken("id-token").Return(nil, context.DeadlineExceeded)
			expectError(proofCtx(), newRequest(), "invalid_grant")
		})

		Convey("session ended", func() {
			okIDToken()
			offlineGrantService.EXPECT().GetOfflineGrant(gomock.Any(), "offline-1").Return(nil, oauth.ErrGrantNotFound)
			expectError(proofCtx(), newRequest(), "invalid_grant")
		})

		Convey("id token without sid", func() {
			idTokenIssuer.EXPECT().VerifyIDToken("id-token").Return(jwtWithSID(""), nil)
			expectError(proofCtx(), newRequest(), "invalid_grant")
		})

		Convey("unknown resource", func() {
			okIDToken()
			offlineGrantService.EXPECT().GetOfflineGrant(gomock.Any(), "offline-1").Return(offlineGrant, nil)
			resourceAccessPolicyService.EXPECT().GetResourceByURI(gomock.Any(), gomock.Any(), gomock.Any()).
				Return(nil, resourcescope.ErrResourceNotFound)
			expectError(proofCtx(), newRequest(), "invalid_target")
		})

	})
}
