package viewmodels

import (
	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/authn/identity"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/interaction"
)

type IdentityCandidatesGetter interface {
	GetIdentityCandidates() []identity.Candidate
}

type AuthenticationViewModel struct {
	IdentityCandidates     []identity.Candidate
	IdentityCount          int
	LoginIDInputVariant    string
	LoginIDDisabled        bool
	PhoneLoginIDEnabled    bool
	EmailLoginIDEnabled    bool
	UsernameLoginIDEnabled bool
	TextLoginIDInputType   string
	PasskeyEnabled         bool
}

type AuthenticationViewModeler struct {
	Authentication *config.AuthenticationConfig
}

func (m *AuthenticationViewModeler) NewWithGraph(graph *interaction.Graph) AuthenticationViewModel {
	var node IdentityCandidatesGetter
	if !graph.FindLastNode(&node) {
		panic("webapp: no node with identity candidates found")
	}

	return m.NewWithCandidates(node.GetIdentityCandidates())
}

func (m *AuthenticationViewModeler) NewWithCandidates(candidates []identity.Candidate) AuthenticationViewModel {
	hasEmail := false
	hasUsername := false
	hasPhone := false
	identityCount := 0

	for _, c := range candidates {
		typ, _ := c[identity.CandidateKeyType].(string)
		if typ == string(model.IdentityTypeLoginID) {
			loginIDType, _ := c[identity.CandidateKeyLoginIDType].(string)
			switch loginIDType {
			case "phone":
				c["login_id_input_type"] = "phone"
				hasPhone = true
			case "email":
				c["login_id_input_type"] = "email"
				hasEmail = true
			default:
				c["login_id_input_type"] = "text"
				hasUsername = true
			}
		}

		identityID := c[identity.CandidateKeyIdentityID].(string)
		if identityID != "" {
			identityCount++
		}
	}

	textLoginIDInputType := "text"
	if hasEmail && !hasUsername {
		textLoginIDInputType = "email"
	}

	loginIDDisabled := !hasEmail && !hasUsername && !hasPhone

	var variant string
	if hasEmail {
		if hasUsername {
			variant = "email_or_username"
		} else {
			variant = "email"
		}
	} else {
		if hasUsername {
			variant = "username"
		} else {
			variant = "none"
		}
	}

	passkeyEnabled := false
	for _, typ := range m.Authentication.Identities {
		if typ == model.IdentityTypePasskey {
			passkeyEnabled = true
		}
	}

	return AuthenticationViewModel{
		IdentityCandidates:     candidates,
		IdentityCount:          identityCount,
		LoginIDInputVariant:    variant,
		LoginIDDisabled:        loginIDDisabled,
		PhoneLoginIDEnabled:    hasPhone,
		EmailLoginIDEnabled:    hasEmail,
		UsernameLoginIDEnabled: hasUsername,
		TextLoginIDInputType:   textLoginIDInputType,
		PasskeyEnabled:         passkeyEnabled,
	}
}
