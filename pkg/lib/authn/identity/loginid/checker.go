package loginid

import (
	"github.com/authgear/authgear-server/pkg/lib/authn/identity"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/util/validation"
)

type CheckerOptions struct {
	EmailByPassBlocklistAllowlist bool
}

type Checker struct {
	Config             *config.LoginIDConfig
	TypeCheckerFactory *TypeCheckerFactory
}

func (c *Checker) ValidateOne(loginID identity.LoginIDSpec, options CheckerOptions) error {
	ctx := &validation.Context{}
	c.validateOne(ctx, loginID, options)
	return ctx.Error("invalid login ID")
}

func (c *Checker) validateOne(ctx *validation.Context, loginID identity.LoginIDSpec, options CheckerOptions) {
	originCtx := ctx
	ctx = ctx.Child("login_id")

	allowed := false
	for _, keyConfig := range c.Config.Keys {
		if keyConfig.Key == loginID.Key {
			if len(loginID.Value.TrimSpace()) > *keyConfig.MaxLength {
				ctx.EmitError("maxLength", map[string]interface{}{
					"expected": *keyConfig.MaxLength,
					"actual":   len(loginID.Value.TrimSpace()),
				})
				return
			}

			allowed = true
		}
	}
	if !allowed {
		ctx.EmitErrorMessage("login ID key is not allowed")
		return
	}

	if loginID.Value.TrimSpace() == "" {
		ctx.EmitError("required", nil)
		return
	}

	c.TypeCheckerFactory.NewChecker(loginID.Type, options).Validate(originCtx, loginID.Value.TrimSpace())
}
