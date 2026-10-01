package authz

import (
	"context"
	"strings"
	"time"
)

const ResourceTypeAuthgear = "authgear:resource"

const (
	ContextKeyGrantID = "grant_id"
	ContextKeyActor   = "actor"
	PropertyTeam      = "team"
	ResourceKindTeam  = "team"
)

// AgentGrant is the part of an agent grant the PDP needs.
// It is decoupled from oauth.AgentGrant to avoid an import cycle.
type AgentGrant struct {
	UserID   string
	Actor    string
	Audience string
	ExpireAt time.Time
	Permits  func(namespace string, action string, team string) bool
}

// AgentGrantQueries returns (nil, nil) when the grant does not exist.
type AgentGrantQueries interface {
	GetAgentGrant(ctx context.Context, id string) (*AgentGrant, error)
}

// GrantID returns the context.grant_id of a Grant request, or "".
func (r EvaluationRequest) GrantID() string {
	if r.Resource.Type == ResourceTypeAuthgear {
		return ""
	}
	id, _ := r.Context[ContextKeyGrantID].(string)
	return id
}

func (r EvaluationRequest) IsGrantRequest() bool {
	return r.GrantID() != ""
}

// grantTeam returns the team a Grant request targets, or "".
func (r EvaluationRequest) grantTeam() (namespace string, team string) {
	namespace, kind, _ := strings.Cut(r.Resource.Type, ":")
	if kind == ResourceKindTeam {
		return namespace, r.Resource.ID
	}
	team, _ = r.Resource.Properties[PropertyTeam].(string)
	return namespace, team
}

func (s *Service) evaluateGrant(ctx context.Context, version int64, req EvaluationRequest) (decision bool, hit bool, err error) {
	hit = true
	grant, err := s.AgentGrants.GetAgentGrant(ctx, req.GrantID())
	if err != nil {
		return false, hit, err
	}
	if grant == nil || !s.Clock.NowUTC().Before(grant.ExpireAt) {
		return false, hit, nil
	}
	if grant.UserID != req.Subject.ID {
		return false, hit, nil
	}
	if actor, ok := req.Context[ContextKeyActor].(string); ok && actor != grant.Actor {
		return false, hit, nil
	}
	namespace, team := req.grantTeam()
	if !grant.Permits(namespace, req.Action.Name, team) {
		return false, hit, nil
	}
	snap, snapHit, err := s.loadSnapshot(ctx, version, grant.UserID)
	if err != nil {
		return false, false, err
	}
	return !snap.Disabled, snapHit, nil
}
