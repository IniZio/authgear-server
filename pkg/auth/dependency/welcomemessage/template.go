package welcomemessage

import (
	"github.com/skygeario/skygear-server/pkg/auth/config"
	"github.com/skygeario/skygear-server/pkg/template"
)

const (
	TemplateItemTypeWelcomeEmailTXT  config.TemplateItemType = "welcome_email.txt"
	TemplateItemTypeWelcomeEmailHTML config.TemplateItemType = "welcome_email.html"
)

var TemplateWelcomeEmailTXT = template.Spec{
	Type: TemplateItemTypeWelcomeEmailTXT,
	Default: `Hello {{ .email }},

Welcome to Skygear.

Thanks.`,
}

var TemplateWelcomeEmailHTML = template.Spec{
	Type:   TemplateItemTypeWelcomeEmailHTML,
	IsHTML: true,
	Default: `<!DOCTYPE html>
<html>
<body>
<p>Hello {{ .email }},</p>
<p>Welcome to Skygear.</p>
<p>Thanks.</p>
</body>
</html>
`,
}
