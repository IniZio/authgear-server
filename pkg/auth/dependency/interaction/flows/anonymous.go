package flows

import (
	"encoding/json"

	"github.com/authgear/authgear-server/pkg/auth/config"
	"github.com/authgear/authgear-server/pkg/auth/dependency/challenge"
	"github.com/authgear/authgear-server/pkg/auth/dependency/identity"
	"github.com/authgear/authgear-server/pkg/auth/dependency/identity/anonymous"
	"github.com/authgear/authgear-server/pkg/auth/dependency/interaction"
	"github.com/authgear/authgear-server/pkg/core/authn"
)

type AnonymousIdentityProvider interface {
	ParseRequest(requestJWT string) (*anonymous.Identity, *anonymous.Request, error)
}

type ChallengeProvider interface {
	Consume(token string) (*challenge.Purpose, error)
}

type AnonymousFlow struct {
	Config       *config.AuthenticationConfig
	Interactions InteractionProvider
	Anonymous    AnonymousIdentityProvider
	Challenges   ChallengeProvider
}

func (f *AnonymousFlow) IsEnabled() bool {
	for _, i := range f.Config.Identities {
		if i == authn.IdentityTypeAnonymous {
			return true
		}
	}
	return false
}

func (f *AnonymousFlow) Authenticate(requestJWT string, clientID string) (*authn.Attrs, error) {
	if !f.IsEnabled() {
		return nil, ErrAnonymousDisabled
	}

	iden, request, err := f.Anonymous.ParseRequest(requestJWT)
	if err != nil || request.Action != anonymous.RequestActionAuth {
		return nil, interaction.ErrInvalidCredentials
	}

	// Verify challenge token
	purpose, err := f.Challenges.Consume(request.Challenge)
	if err != nil || *purpose != challenge.PurposeAnonymousRequest {
		return nil, interaction.ErrInvalidCredentials
	}

	var keyID string
	if iden != nil {
		keyID = iden.KeyID
	} else {
		// Sign up if identity does not exist
		jwk, err := json.Marshal(request.Key)
		if err != nil {
			return nil, interaction.ErrInvalidCredentials
		}

		i, err := f.Interactions.NewInteractionSignup(&interaction.IntentSignup{
			Identity: identity.Spec{
				Type: authn.IdentityTypeAnonymous,
				Claims: map[string]interface{}{
					identity.IdentityClaimAnonymousKeyID: request.Key.KeyID(),
					identity.IdentityClaimAnonymousKey:   string(jwk),
				},
			},
		}, clientID)
		if err != nil {
			return nil, err
		}
		s, err := f.Interactions.GetInteractionState(i)
		if err != nil {
			return nil, err
		}
		if s.CurrentStep().Step != interaction.StepCommit {
			panic("interaction_flow_anonymous: unexpected interaction state")
		}
		_, err = f.Interactions.Commit(i)
		if err != nil {
			return nil, err
		}

		keyID = request.Key.KeyID()
	}

	// Login after ensuring user & identity exists
	i, err := f.Interactions.NewInteractionLogin(&interaction.IntentLogin{
		Identity: identity.Spec{
			Type: authn.IdentityTypeAnonymous,
			Claims: map[string]interface{}{
				identity.IdentityClaimAnonymousKeyID: keyID,
			},
		},
	}, clientID)
	if err != nil {
		return nil, err
	}
	s, err := f.Interactions.GetInteractionState(i)
	if err != nil {
		return nil, err
	}
	if s.CurrentStep().Step != interaction.StepCommit {
		panic("interaction_flow_anonymous: unexpected interaction state")
	}
	result, err := f.Interactions.Commit(i)
	if err != nil {
		return nil, err
	}

	return result.Attrs, nil
}

func (f *AnonymousFlow) DecodeUserID(requestJWT string) (string, anonymous.RequestAction, error) {
	if !f.IsEnabled() {
		return "", "", ErrAnonymousDisabled
	}

	identity, request, err := f.Anonymous.ParseRequest(requestJWT)
	if err != nil || identity == nil {
		return "", "", interaction.ErrInvalidCredentials
	}

	// Verify challenge token
	purpose, err := f.Challenges.Consume(request.Challenge)
	if err != nil || *purpose != challenge.PurposeAnonymousRequest {
		return "", "", interaction.ErrInvalidCredentials
	}

	return identity.UserID, request.Action, nil
}
