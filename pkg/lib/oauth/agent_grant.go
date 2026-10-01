package oauth

import (
	"errors"
	"slices"
	"time"
)

var ErrAgentGrantNotFound = errors.New("agent grant not found")

// AuthorizationDetail is an RFC 9396 authorization_details entry.
type AuthorizationDetail struct {
	Type    string   `json:"type"`
	Teams   []string `json:"teams,omitempty"`
	Actions []string `json:"actions,omitempty"`
}

type AgentGrant struct {
	ID                   string                `json:"id"`
	UserID               string                `json:"user_id"`
	SID                  string                `json:"sid"`
	ClientID             string                `json:"client_id"`
	Actor                string                `json:"actor"`
	Audience             string                `json:"audience"`
	AuthorizationDetails []AuthorizationDetail `json:"authorization_details"`
	CreatedAt            time.Time             `json:"created_at"`
	ExpireAt             time.Time             `json:"expire_at"`
}

// Permits reports whether any detail of the given type covers action on team.
func (g *AgentGrant) Permits(resourceTypeNamespace string, action string, team string) bool {
	if team == "" {
		return false
	}
	for _, d := range g.AuthorizationDetails {
		if d.Type == resourceTypeNamespace &&
			slices.Contains(d.Teams, team) &&
			slices.Contains(d.Actions, action) {
			return true
		}
	}
	return false
}
