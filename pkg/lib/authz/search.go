package authz

import (
	"context"
	"slices"
	"strings"
)

// SearchGrantTeams returns the teams the grant permits req.Action on, for the
// namespace of req.Resource.Type. Any mismatch yields an empty result.
func (s *Service) SearchGrantTeams(ctx context.Context, req EvaluationRequest) ([]string, error) {
	teams := []string{}
	grant, err := s.AgentGrants.GetAgentGrant(ctx, req.GrantID())
	if err != nil {
		return nil, err
	}
	if grant == nil || !s.Clock.NowUTC().Before(grant.ExpireAt) {
		return teams, nil
	}
	if grant.UserID != req.Subject.ID {
		return teams, nil
	}
	if actor, ok := req.Context[ContextKeyActor].(string); ok && actor != grant.Actor {
		return teams, nil
	}

	version, err := s.Versions.Get(ctx)
	if err != nil {
		return nil, err
	}
	snap, _, err := s.loadSnapshot(ctx, version, grant.UserID)
	if err != nil {
		return nil, err
	}
	if snap.Disabled {
		return teams, nil
	}

	namespace, _, _ := strings.Cut(req.Resource.Type, ":")
	for _, d := range grant.Details {
		if d.Type != namespace || !slices.Contains(d.Actions, req.Action.Name) {
			continue
		}
		for _, t := range d.Teams {
			if !slices.Contains(teams, t) {
				teams = append(teams, t)
			}
		}
	}
	return teams, nil
}
