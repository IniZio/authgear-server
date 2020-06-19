package config

import (
	"bytes"
	"encoding/json"
	"strconv"

	"sigs.k8s.io/yaml"

	"github.com/skygeario/skygear-server/pkg/validation"
)

type Config struct {
	AppConfig    *AppConfig
	SecretConfig *SecretConfig
}

var _ = Schema.Add("AppConfig", `
{
	"type": "object",
	"properties": {
		"id": { "type": "string" },
		"metadata": { "$ref": "#/$defs/AppMetadata" },
		"http": { "$ref": "#/$defs/HTTPConfig" },
		"hook": { "$ref": "#/$defs/HookConfig" },
		"template": { "$ref": "#/$defs/TemplateConfig" },
		"ui": { "$ref": "#/$defs/UIConfig" },
		"localization": { "$ref": "#/$defs/LocalizationConfig" },
		"authentication": { "$ref": "#/$defs/AuthenticationConfig" },
		"session": { "$ref": "#/$defs/SessionConfig" },
		"oauth": { "$ref": "#/$defs/OAuthConfig" },
		"identity": { "$ref": "#/$defs/IdentityConfig" },
		"authenticator": { "$ref": "#/$defs/AuthenticatorConfig" },
		"forgot_password": { "$ref": "#/$defs/ForgotPasswordConfig" },
		"welcome_message": { "$ref": "#/$defs/WelcomeMessageConfig" }
	},
	"required": ["id"]
}
`)

type AppConfig struct {
	ID       string      `json:"id"`
	Metadata AppMetadata `json:"metadata,omitempty"`

	HTTP *HTTPConfig `json:"http,omitempty"`
	Hook *HookConfig `json:"hook,omitempty"`

	Template     *TemplateConfig     `json:"template,omitempty"`
	UI           *UIConfig           `json:"ui,omitempty"`
	Localization *LocalizationConfig `json:"localization,omitempty"`

	Authentication *AuthenticationConfig `json:"authentication,omitempty"`
	Session        *SessionConfig        `json:"session,omitempty"`
	OAuth          *OAuthConfig          `json:"oauth,omitempty"`
	Identity       *IdentityConfig       `json:"identity,omitempty"`
	Authenticator  *AuthenticatorConfig  `json:"authenticator,omitempty"`

	ForgotPassword *ForgotPasswordConfig `json:"forgot_password,omitempty"`
	WelcomeMessage *WelcomeMessageConfig `json:"welcome_message,omitempty"`
}

func (c *AppConfig) Validate(ctx *validation.Context) {
	for i, client := range c.OAuth.Clients {
		if client.RefreshTokenLifetime() < client.AccessTokenLifetime() {
			ctx.Child("oauth", "clients", strconv.Itoa(i), "refresh_token_lifetime_seconds").EmitErrorMessage(
				"refresh token lifetime must be greater than or equal to access token lifetime",
			)
		}
	}

	oAuthProviderIDs := map[string]struct{}{}
	oauthProviderAliases := map[string]struct{}{}
	for i, provider := range c.Identity.OAuth.Providers {
		// Ensure provider ID is not duplicated
		id, err := json.Marshal(provider.ProviderID().Claims())
		if err != nil {
			panic("config: cannot marshal provider ID claims: " + err.Error())
		}
		if _, ok := oAuthProviderIDs[string(id)]; ok {
			ctx.Child("identity", "oauth", "providers", strconv.Itoa(i)).
				EmitErrorMessage("duplicated OAuth provider")
			continue
		}
		oAuthProviderIDs[string(id)] = struct{}{}

		// Ensure alias is not duplicated.
		if _, ok := oauthProviderAliases[provider.Alias]; ok {
			ctx.Child("identity", "oauth", "providers", strconv.Itoa(i)).
				EmitErrorMessage("duplicated OAuth provider alias")
			continue
		}
		oauthProviderAliases[provider.Alias] = struct{}{}
	}

	authenticatorTypes := map[string]struct{}{}
	for i, a := range c.Authentication.PrimaryAuthenticators {
		if _, ok := authenticatorTypes[string(a)]; ok {
			ctx.Child("authentication", "primary_authenticators", strconv.Itoa(i)).
				EmitErrorMessage("duplicated authenticator type")
		}
		authenticatorTypes[string(a)] = struct{}{}
	}
	for i, a := range c.Authentication.SecondaryAuthenticators {
		if _, ok := authenticatorTypes[string(a)]; ok {
			ctx.Child("authentication", "secondary_authenticators", strconv.Itoa(i)).
				EmitErrorMessage("duplicated authenticator type")
		}
		authenticatorTypes[string(a)] = struct{}{}
	}

	countryCallingCodeDefaultOK := false
	for _, code := range c.UI.CountryCallingCode.Values {
		if code == c.UI.CountryCallingCode.Default {
			countryCallingCodeDefaultOK = true
		}
	}
	if !countryCallingCodeDefaultOK {
		ctx.Child("ui", "country_calling_code", "default").
			EmitErrorMessage("default country calling code is unlisted")
	}
}

func Parse(inputYAML []byte) (*AppConfig, error) {
	jsonData, err := yaml.YAMLToJSON(inputYAML)
	if err != nil {
		return nil, err
	}

	err = Schema.ValidateReader(bytes.NewReader(jsonData))
	if err != nil {
		return nil, err
	}

	var config AppConfig
	decoder := json.NewDecoder(bytes.NewReader(jsonData))
	err = decoder.Decode(&config)
	if err != nil {
		return nil, err
	}

	setFieldDefaults(&config)

	err = validation.ValidateValue(&config)
	if err != nil {
		return nil, err
	}

	return &config, nil
}
