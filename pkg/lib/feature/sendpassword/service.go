package sendpassword

import (
	"github.com/authgear/authgear-server/pkg/api/event/nonblocking"
	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/authn/identity"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/messaging"
	"github.com/authgear/authgear-server/pkg/lib/translation"
	"github.com/authgear/authgear-server/pkg/util/template"
)

type IdentityService interface {
	ListByUser(userID string) ([]*identity.Info, error)
}

type TranslationService interface {
	EmailMessageData(msg *translation.MessageSpec, args interface{}) (*translation.EmailMessageData, error)
}

type SenderService interface {
	PrepareEmail(email string, msgType nonblocking.MessageType) (*messaging.EmailMessage, error)
}

type Service struct {
	AppConfg    *config.AppConfig
	Identities  IdentityService
	Sender      SenderService
	Translation TranslationService
}

type PreparedMessage struct {
	email   *messaging.EmailMessage
	spec    *translation.MessageSpec
	msgType nonblocking.MessageType
}

func (m *PreparedMessage) Close() {
	if m.email != nil {
		m.email.Close()
	}
}

func (s *Service) getEmailList(userID string) ([]string, error) {
	infos, err := s.Identities.ListByUser(userID)
	if err != nil {
		return nil, err
	}

	var emails []string
	for _, info := range infos {
		if !info.Type.SupportsPassword() {
			continue
		}

		standardClaims := info.IdentityAwareStandardClaims()
		email := standardClaims[model.ClaimEmail]
		if email != "" {
			emails = append(emails, email)
		}
	}

	return emails, nil
}

func (s *Service) prepareMessage(email string, typ MessageType) (*PreparedMessage, error) {
	var spec *translation.MessageSpec
	var msgType nonblocking.MessageType

	switch typ {
	case MessageTypeChangePassword:
		spec = messageChangePassword
		msgType = nonblocking.MessageTypeChangePassword
	case MessageTypeCreateUser:
		spec = messageCreateUser
		msgType = nonblocking.MessageTypeCreateUser
	default:
		panic("sendpassword: unknown message type: " + msgType)
	}

	msg, err := s.Sender.PrepareEmail(email, msgType)
	if err != nil {
		return nil, err
	}

	return &PreparedMessage{
		email:   msg,
		spec:    spec,
		msgType: msgType,
	}, nil
}

func (s *Service) Send(userID string, password string, msgType MessageType) error {
	emails, err := s.getEmailList(userID)
	if err != nil {
		return err
	}

	if len(emails) == 0 {
		return ErrSendPasswordNoTarget
	}

	for _, email := range emails {
		msg, err := s.prepareMessage(email, msgType)
		if err != nil {
			return err
		}
		defer msg.Close()

		ctx := make(map[string]any)
		template.Embed(ctx, messageTemplateContext{
			AppName:  string(s.AppConfg.ID),
			Email:    email,
			Password: password,
		})

		data, err := s.Translation.EmailMessageData(msg.spec, ctx)
		if err != nil {
			return err
		}

		msg.email.Sender = data.Sender
		msg.email.ReplyTo = data.ReplyTo
		msg.email.Subject = data.Subject
		msg.email.TextBody = data.TextBody
		msg.email.HTMLBody = data.HTMLBody

		if err := msg.email.Send(); err != nil {
			return err
		}
	}

	return nil
}
