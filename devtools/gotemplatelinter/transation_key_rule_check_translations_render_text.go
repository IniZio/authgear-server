package main

import (
	"text/template/parse"
)

// validate commands with variable `$.Translations.RenderText` or field `.Translations.RenderText`
//
// example: `($.Translations.RenderText "customer-support-link" nil)`
// example: (.Translations.RenderText "terms-of-service-link" nil)
func CheckCommandTranslationsRenderText(node *parse.CommandNode) (err error) {
	// 2nd arg should be translation key
	for idx, arg := range node.Args {
		if idx == 1 {
			err = CheckTranslationKeyNode(arg)
			if err != nil {
				return err
			}
		}

	}
	return
}
