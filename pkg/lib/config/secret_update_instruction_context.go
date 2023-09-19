package config

import (
	mathrand "math/rand"
	"time"

	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/lestrrat-go/jwx/v2/jwk"
)

type SecretConfigUpdateInstructionContext struct {
	Clock                            clock.Clock
	GenerateClientSecretOctetKeyFunc func(createdAt time.Time, rng *mathrand.Rand) jwk.Key
	GenerateAdminAPIAuthKeyFunc      func(createdAt time.Time, rng *mathrand.Rand) jwk.Key
}
