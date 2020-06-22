package welcomemessage

import (
	"context"

	"github.com/skygeario/skygear-server/pkg/auth/dependency/identity"
	taskspec "github.com/skygeario/skygear-server/pkg/auth/task/spec"
	"github.com/skygeario/skygear-server/pkg/core/async"
	"github.com/skygeario/skygear-server/pkg/core/auth/metadata"
	"github.com/skygeario/skygear-server/pkg/core/config"
	"github.com/skygeario/skygear-server/pkg/core/intl"
	"github.com/skygeario/skygear-server/pkg/core/mail"
	"github.com/skygeario/skygear-server/pkg/template"
)

type Provider struct {
	Context                     context.Context
	LocalizationConfiguration   *config.LocalizationConfiguration
	MetadataConfiguration       config.AuthUIMetadataConfiguration
	EmailConfig                 config.EmailMessageConfiguration
	WelcomeMessageConfiguration *config.WelcomeMessageConfiguration
	TemplateEngine              *template.Engine
	TaskQueue                   async.Queue
}

func (p *Provider) send(emails []string) (err error) {
	if !p.WelcomeMessageConfiguration.Enabled {
		return
	}

	if p.WelcomeMessageConfiguration.Destination == config.WelcomeMessageDestinationFirst {
		if len(emails) > 1 {
			emails = emails[0:1]
		}
	}

	if len(emails) <= 0 {
		return
	}

	var emailMessages []mail.SendOptions
	for _, email := range emails {
		data := map[string]interface{}{
			"email": email,
		}

		preferredLanguageTags := intl.GetPreferredLanguageTags(p.Context)
		data["appname"] = intl.LocalizeJSONObject(preferredLanguageTags, intl.Fallback(p.LocalizationConfiguration.FallbackLanguage), p.MetadataConfiguration, "app_name")

		var textBody string
		textBody, err = p.TemplateEngine.RenderTemplate(
			TemplateItemTypeWelcomeEmailTXT,
			data,
			template.ResolveOptions{},
		)
		if err != nil {
			return
		}

		var htmlBody string
		htmlBody, err = p.TemplateEngine.RenderTemplate(
			TemplateItemTypeWelcomeEmailHTML,
			data,
			template.ResolveOptions{},
		)
		if err != nil {
			return
		}

		emailMessages = append(emailMessages, mail.SendOptions{
			MessageConfig: p.EmailConfig,
			Recipient:     email,
			TextBody:      textBody,
			HTMLBody:      htmlBody,
		})
	}

	p.TaskQueue.Enqueue(async.TaskSpec{
		Name: taskspec.SendMessagesTaskName,
		Param: taskspec.SendMessagesTaskParam{
			EmailMessages: emailMessages,
		},
	})

	return
}

func (p *Provider) SendToIdentityInfos(infos []*identity.Info) (err error) {
	var emails []string
	for _, info := range infos {
		if email, ok := info.Claims[string(metadata.Email)].(string); ok {
			emails = append(emails, email)
		}
	}
	return p.send(emails)
}
