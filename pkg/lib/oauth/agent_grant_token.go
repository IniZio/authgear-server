package oauth

import (
	"context"

	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jws"
	"github.com/lestrrat-go/jwx/v2/jwt"

	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/util/jwtutil"
	"github.com/authgear/authgear-server/pkg/util/uuid"
)

func (e *AccessTokenEncoding) EncodeAgentGrantToken(ctx context.Context, grant *AgentGrant) (string, error) {
	claims := jwt.New()
	_ = claims.Set(jwt.JwtIDKey, uuid.New())
	_ = claims.Set(jwt.IssuerKey, e.IDTokenIssuer.Iss())
	_ = claims.Set(jwt.AudienceKey, grant.Audience)
	_ = claims.Set(jwt.SubjectKey, grant.UserID)
	_ = claims.Set(jwt.IssuedAtKey, grant.CreatedAt.Unix())
	_ = claims.Set(jwt.ExpirationKey, grant.ExpireAt.Unix())
	_ = claims.Set("client_id", grant.ClientID)
	_ = claims.Set("act", map[string]any{"sub": grant.Actor})
	_ = claims.Set(authz.ContextKeyGrantID, grant.ID)
	_ = claims.Set("authorization_details", grant.AuthorizationDetails)
	_ = claims.Set("cnf", map[string]any{"jkt": grant.DPoPJKT})

	jwk, _ := e.Secrets.Set.Key(0)

	hdr := jws.NewHeaders()
	_ = hdr.Set("typ", "at+jwt")

	signed, err := jwtutil.SignWithHeader(claims, hdr, jwa.RS256, jwk)
	if err != nil {
		return "", err
	}
	return string(signed), nil
}
