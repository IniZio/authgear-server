package test

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/authgear/authgear-server/pkg/lib/config"
)

type FixturePlanName string

const (
	FixtureLimitedPlanName   FixturePlanName = "limited"
	FixtureUnlimitedPlanName FixturePlanName = "unlimited"
)

func newInt(v int) *int { return &v }

func FixtureAppConfig(appID string) *config.AppConfig {
	cfg := config.GenerateAppConfigFromOptions(&config.GenerateAppConfigOptions{
		AppID:        appID,
		PublicOrigin: fmt.Sprintf("http://%s.localhost", appID),
	})
	return cfg
}

func FixtureSecretConfig(seed int64) *config.SecretConfig {
	return config.GenerateSecretConfigFromOptions(&config.GenerateSecretConfigOptions{
		DatabaseURL:      "postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable",
		DatabaseSchema:   "public",
		ElasticsearchURL: "http://127.0.0.1:9200",
		RedisURL:         "redis://127.0.0.1",
	}, time.Date(2006, 1, 2, 3, 4, 5, 0, time.UTC), rand.New(rand.NewSource(seed)))
}

func FixtureFeatureConfig(plan FixturePlanName) *config.FeatureConfig {
	switch plan {
	case FixtureLimitedPlanName:
		cfg := config.NewEffectiveDefaultFeatureConfig()
		cfg.OAuth = &config.OAuthFeatureConfig{
			Client: &config.OAuthClientFeatureConfig{
				Maximum: newInt(1),
			},
		}
		cfg.Identity = &config.IdentityFeatureConfig{
			OAuth: &config.OAuthSSOFeatureConfig{
				MaximumProviders: newInt(1),
			},
		}
		cfg.Hook = &config.HookFeatureConfig{
			BlockingHandler: &config.BlockingHandlerFeatureConfig{
				Maximum: newInt(1),
			},
			NonBlockingHandler: &config.NonBlockingHandlerFeatureConfig{
				Maximum: newInt(1),
			},
		}
		return cfg
	case FixtureUnlimitedPlanName:
		return config.NewEffectiveDefaultFeatureConfig()
	}
	return nil
}
