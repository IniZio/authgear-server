package nonblocking

import (
	"github.com/authgear/authgear-server/pkg/api/event"
)

const (
	AdminAPIMutationRemoveScopesFromRoleExecuted event.Type = "admin_api.mutation.remove_scopes_from_role.executed"
)

type AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload struct {
	RoleKey     string   `json:"role_key"`
	ResourceURI string   `json:"resource_uri"`
	Scopes      []string `json:"scopes"`
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) NonBlockingEventType() event.Type {
	return AdminAPIMutationRemoveScopesFromRoleExecuted
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) UserID() string {
	return ""
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) GetTriggeredBy() event.TriggeredByType {
	return event.TriggeredByTypeAdminAPI
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) FillContext(ctx *event.Context) {
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) ForHook() bool {
	return false
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) ForAudit() bool {
	return true
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) RequireReindexUserIDs() []string {
	return nil
}

func (e *AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload) DeletedUserIDs() []string {
	return nil
}

var _ event.NonBlockingPayload = &AdminAPIMutationRemoveScopesFromRoleExecutedEventPayload{}
