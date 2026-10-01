package authz

import (
	"context"
	"testing"
	"time"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/util/clock"
)

func TestServiceSearchGrantTeams(t *testing.T) {
	Convey("Service.SearchGrantTeams", t, func() {
		ctx := context.Background()
		now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		users := &fakeUsers{users: map[string]*model.User{
			"alice": {},
			"bob":   {IsDisabled: true},
		}}
		details := []AgentGrantDetail{
			{Type: "linear", Teams: []string{"ENG", "FIN"}, Actions: []string{"issue:read"}},
			{Type: "linear", Teams: []string{"FIN", "OPS"}, Actions: []string{"issue:read", "issue:write"}},
			{Type: "other", Teams: []string{"X"}, Actions: []string{"issue:read"}},
		}
		mk := func(user string, expire time.Time) *AgentGrant {
			return &AgentGrant{UserID: user, Actor: "sbx", Audience: "https://gw", ExpireAt: expire, Details: details}
		}
		s := &Service{
			Clock:    clock.NewMockClockAtTime(now),
			Database: newTestAppDBHandle(t),
			Users:    users,
			Roles:    &fakeRoles{},
			AgentGrants: &fakeAgentGrants{grants: map[string]*AgentGrant{
				"g1":       mk("alice", now.Add(time.Hour)),
				"expired":  mk("alice", now.Add(-time.Second)),
				"disabled": mk("bob", now.Add(time.Hour)),
			}},
			Versions: &fakeVersions{version: 1},
			Cache:    &fakeCache{snaps: map[string]*PermissionSnapshot{}},
		}
		search := func(user, grantID, action, actor string) []string {
			c := map[string]any{"grant_id": grantID}
			if actor != "" {
				c["actor"] = actor
			}
			teams, err := s.SearchGrantTeams(ctx, EvaluationRequest{
				Subject:  Subject{Type: "user", ID: user},
				Resource: Resource{Type: "linear:team"},
				Action:   Action{Name: action},
				Context:  c,
			})
			So(err, ShouldBeNil)
			return teams
		}

		So(search("alice", "g1", "issue:read", "sbx"), ShouldResemble, []string{"ENG", "FIN", "OPS"})
		So(search("alice", "g1", "issue:write", ""), ShouldResemble, []string{"FIN", "OPS"})
		So(search("alice", "g1", "comment:delete", ""), ShouldResemble, []string{})
		So(search("alice", "g1", "issue:read", "other"), ShouldResemble, []string{})
		So(search("alice", "revoked", "issue:read", ""), ShouldResemble, []string{})
		So(search("alice", "expired", "issue:read", ""), ShouldResemble, []string{})
		So(search("bob", "disabled", "issue:read", ""), ShouldResemble, []string{})
		So(search("carol", "g1", "issue:read", ""), ShouldResemble, []string{})
	})
}
