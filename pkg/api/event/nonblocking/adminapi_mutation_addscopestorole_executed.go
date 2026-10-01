package nonblocking

import (
	"github.com/authgear/authgear-server/pkg/api/event"
)

const (
	AdminAPIMutationAddScopesToRoleExecuted event.Type = "admin_api.mutation.add_scopes_to_role.executed"
)

type AdminAPIMutationAddScopesToRoleExecutedEventPayload struct {
	RoleKey     string   `json:"role_key"`
	ResourceURI string   `json:"resource_uri"`
	Scopes      []string `json:"scopes"`
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) NonBlockingEventType() event.Type {
	return AdminAPIMutationAddScopesToRoleExecuted
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) UserID() string {
	return ""
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) GetTriggeredBy() event.TriggeredByType {
	return event.TriggeredByTypeAdminAPI
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) FillContext(ctx *event.Context) {
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) ForHook() bool {
	return false
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) ForAudit() bool {
	return true
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) RequireReindexUserIDs() []string {
	return nil
}

func (e *AdminAPIMutationAddScopesToRoleExecutedEventPayload) DeletedUserIDs() []string {
	return nil
}

var _ event.NonBlockingPayload = &AdminAPIMutationAddScopesToRoleExecutedEventPayload{}
