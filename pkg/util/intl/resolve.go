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

// ResolveUnicodeCldr resolves language tag to Unicode CLDR language tag.
func ResolveUnicodeCldr(lang language.Tag, fallback language.Tag) string {
	var cldrTags []language.Tag
	for _, cldr := range CldrLanguages {
		cldrTags = append(cldrTags, language.MustParse(cldr))
	}

	matcher := GetMatcher(cldrTags)
	_, idx, confidence := matcher.Match(lang)
	if confidence == language.No {
		return fallback.String()
	}

	return CldrLanguages[idx]
}
