package oauth

import (
	"crypto/subtle"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/oauth/protocol"
)

// ValidateClientSecret compares secret against every secret of the client in constant time.
// It returns the masked matching secret.
func ValidateClientSecret(credentials *config.OAuthClientCredentials, clientID string, secret string) (maskedSecret string, err error) {
	credentialsItem, ok := credentials.Lookup(clientID)
	if !ok {
		return "", protocol.NewError("invalid_request", "client secret is not supported for the client")
	}

	for _, key := range credentialsItem.Keys() {
		if subtle.ConstantTimeCompare([]byte(secret), key.Key) == 1 {
			maskedSecret = key.Mask()
			break
		}
	}
	if maskedSecret == "" {
		return "", protocol.NewError("invalid_request", "invalid client secret")
	}

	return maskedSecret, nil
}
