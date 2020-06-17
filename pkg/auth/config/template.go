package config

var _ = Schema.Add("TemplateConfig", `
{
	"type": "object",
	"properties": {
		"items": { "type": "array", "items": { "$ref": "#/$defs/TemplateItem" } }
	}
}
`)

type TemplateConfig struct {
	Items []TemplateItem `json:"items,omitempty"`
}

var _ = Schema.Add("TemplateItemType", `{ "type": "string" }`)

type TemplateItemType string

var _ = Schema.Add("TemplateItem", `
{
	"type": "object",
	"properties": {
		"type": { "$ref": "#/$defs/TemplateItemType" },
		"language_tag": { "type": "string" },
		"key": { "type": "string" },
		"uri": { "type": "string" }
	},
	"required": ["type", "uri"]
}
`)

type TemplateItem struct {
	Type        TemplateItemType `json:"type,omitempty"`
	LanguageTag string           `json:"language_tag,omitempty"`
	Key         string           `json:"key,omitempty"`
	URI         string           `json:"uri,omitempty"`
}
