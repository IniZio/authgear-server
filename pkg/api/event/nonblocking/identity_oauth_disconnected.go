package nonblocking

import (
	"github.com/authgear/authgear-server/pkg/api/event"
	"github.com/authgear/authgear-server/pkg/api/model"
)

const (
	IdentityOAuthDisconnected event.Type = "identity.oauth.disconnected"
)

type IdentityOAuthDisconnectedEventPayload struct {
	UserRef   model.UserRef  `json:"-"`
	UserModel model.User     `json:"user"`
	Identity  model.Identity `json:"identity"`
	AdminAPI  bool           `json:"-"`
}

func (e *IdentityOAuthDisconnectedEventPayload) NonBlockingEventType() event.Type {
	return IdentityOAuthDisconnected
}

func (e *IdentityOAuthDisconnectedEventPayload) UserID() string {
	return e.UserRef.ID
}

func (e *IdentityOAuthDisconnectedEventPayload) IsAdminAPI() bool {
	return e.AdminAPI
}

func (e *IdentityOAuthDisconnectedEventPayload) FillContext(ctx *event.Context) {
}

func (e *IdentityOAuthDisconnectedEventPayload) ForWebHook() bool {
	return true
}

func (e *IdentityOAuthDisconnectedEventPayload) ForAudit() bool {
	return true
}

var _ event.NonBlockingPayload = &IdentityOAuthDisconnectedEventPayload{}
