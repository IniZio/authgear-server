package intl

import (
	"golang.org/x/text/language"
)

// Resolve resolved language based on fallback and supportedLanguages config.
// Return index of supportedLanguages and resolved language tag.
// Return -1 if not found
func Resolve(preferred []string, fallback string, supported []string) (int, language.Tag) {
	supportedLanguageTags := Supported(supported, Fallback(fallback))
	supportedLanguagesIdx := map[string]int{}
	for i, item := range supported {
		supportedLanguagesIdx[item] = i
	}

	idx, tag := Match(preferred, supportedLanguageTags)
	if idx == -1 {
		return idx, tag
	}

	matched := supportedLanguageTags[idx]
	if idx, ok := supportedLanguagesIdx[matched]; ok {
		return idx, tag
	}

	return -1, tag
}

func ResolveLocaleCode(resolved string, fallback string, supported []string) string {
	var matcher = language.NewMatcher(SupportedLanguageTags(supported))
	var locale language.Tag

	locale, _, confidence := matcher.Match(language.MustParse(resolved))
	if confidence == language.No {
		locale, _ = language.Parse(fallback)
	}

	localeCode := locale.String()
	_, _, region := locale.Raw()

	if locale.Parent() != locale && region.String() != "" {
		localeCode = locale.Parent().String() + "-" + region.String()
	}

	return localeCode
}

func Normalize(lang language.Tag) language.Tag {
	base, _ := lang.Base()
	newLang, _ := language.Compose(base)
	if newLang == language.Chinese {
		s, _ := lang.Script()
		if s.String() != "Hans" && s.String() != "Hant" {
			s = language.MustParseScript("Hant")
		}
		var err error
		newLang, err = language.Compose(base, s)
		if err != nil {
			panic(err)
		}
	}
	return newLang
}
