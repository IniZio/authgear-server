package password

import (
	"crypto/rand"
	"io"
	"strings"

	"github.com/authgear/authgear-server/pkg/lib/config"
	utilrand "github.com/authgear/authgear-server/pkg/util/rand"
)

// Character list for each category.
const (
	CharListLowercase    = "abcdefghijklmnopqrstuvwxyz"
	CharListUppercase    = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	CharListAlphabet     = CharListLowercase + CharListUppercase
	CharListDigit        = "0123456789"
	CharListAlphanumeric = CharListAlphabet + CharListDigit
	// Referenced from "special" character class in Apple's Password Autofill rules.
	// https://developer.apple.com/documentation/security/password_autofill/customizing_password_autofill_rules
	CharListSymbol = "-~!@#$%^&*_+=`|(){}[:;\"'<>,.?]"
)

const (
	// Max trials to generate a password that satisfies the checker.
	MaxTrials = 10
	// Default minimum length of a password, overrides min length in the policy if less than it.
	DefaultMinLength = 8
	// When min guessable level is > 0, the minimum length of a password.
	GuessableEnabledMinLength = 32
)

type characterSet int

const (
	characterSetLowercase characterSet = iota
	characterSetUppercase
	characterSetAlphabet
	characterSetDigit
	characterSetSymbol
)

var allCharacterSets = []characterSet{
	characterSetLowercase,
	characterSetUppercase,
	characterSetAlphabet,
	characterSetDigit,
	characterSetSymbol,
}

func (s characterSet) Append(w io.Writer) error {
	switch s {
	case characterSetLowercase:
		if _, err := w.Write([]byte(CharListLowercase)); err != nil {
			return err
		}
	case characterSetUppercase:
		if _, err := w.Write([]byte(CharListUppercase)); err != nil {
			return err
		}
	case characterSetAlphabet:
		if _, err := w.Write([]byte(CharListAlphabet)); err != nil {
			return err
		}
	case characterSetDigit:
		if _, err := w.Write([]byte(CharListDigit)); err != nil {
			return err
		}
	case characterSetSymbol:
		if _, err := w.Write([]byte(CharListSymbol)); err != nil {
			return err
		}
	default:
		panic("invalid character set")
	}

	return nil
}

type RandSource interface {
	RandomBytes(n int) ([]byte, error)
	Shuffle(list string) (string, error)
}

type CryptoRandSource struct{}

func (r *CryptoRandSource) RandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return nil, err
	}

	return b, nil
}

func (r *CryptoRandSource) Shuffle(list string) (string, error) {
	var charList = []byte(list)

	utilrand.SecureRand.Shuffle(len(charList), func(i, j int) {
		charList[i], charList[j] = charList[j], charList[i]
	})

	return string(charList), nil
}

type Generator struct {
	Checker        *Checker
	RandSource     RandSource
	PasswordConfig *config.AuthenticatorPasswordConfig
}

func (g *Generator) Generate() (string, error) {
	for i := 0; i < MaxTrials; i++ {
		password, err := g.generate()
		if err != nil {
			return "", err
		}

		if err := g.checkPassword(password); err == nil {
			return password, nil
		}
	}

	return "", ErrPasswordGenerateFailed
}

func (g *Generator) generate() (string, error) {
	policy := g.PasswordConfig.Policy

	minLength := getMinLength(policy)
	charList, err := prepareCharacterSet(policy)
	if err != nil {
		return "", err
	}

	var password strings.Builder
	password.Grow(minLength)

	// Add required characters.
	if policy.LowercaseRequired {
		c, err := g.pickRandByte(CharListLowercase)
		if err != nil {
			return "", err
		}
		password.WriteByte(c)
	}
	if policy.UppercaseRequired {
		c, err := g.pickRandByte(CharListUppercase)
		if err != nil {
			return "", err
		}
		password.WriteByte(c)
	}
	if policy.AlphabetRequired && !policy.LowercaseRequired && !policy.UppercaseRequired {
		c, err := g.pickRandByte(CharListAlphabet)
		if err != nil {
			return "", err
		}
		password.WriteByte(c)
	}
	if policy.DigitRequired {
		c, err := g.pickRandByte(CharListDigit)
		if err != nil {
			return "", err
		}
		password.WriteByte(c)
	}
	if policy.SymbolRequired {
		c, err := g.pickRandByte(CharListSymbol)
		if err != nil {
			return "", err
		}
		password.WriteByte(c)
	}

	// Fill the rest of the password with random characters.
	for i := password.Len(); i < minLength; i++ {
		c, err := g.pickRandByte(charList)
		if err != nil {
			return "", err
		}
		password.WriteByte(c)
	}

	// Shuffle the password since we have required characers at the beginning.
	shuffled, err := g.RandSource.Shuffle(password.String())
	if err != nil {
		return "", err
	}

	return shuffled, nil
}

func prepareCharacterSet(policy *config.PasswordPolicyConfig) (string, error) {
	set := map[characterSet]struct{}{}

	if policy.AlphabetRequired {
		set[characterSetAlphabet] = struct{}{}
	}
	if policy.LowercaseRequired {
		set[characterSetLowercase] = struct{}{}
	}
	if policy.UppercaseRequired {
		set[characterSetUppercase] = struct{}{}
	}
	if policy.DigitRequired {
		set[characterSetDigit] = struct{}{}
	}
	if policy.SymbolRequired {
		set[characterSetSymbol] = struct{}{}
	}

	// Default to alphanumeric if no character set is required.
	if len(set) == 0 {
		set[characterSetAlphabet] = struct{}{}
		set[characterSetDigit] = struct{}{}
	}

	// Remove overlapping character sets.
	_, hasLowerCase := set[characterSetLowercase]
	_, hasUpperCase := set[characterSetUppercase]
	_, hasAlphabet := set[characterSetAlphabet]
	if hasAlphabet && hasLowerCase {
		delete(set, characterSetLowercase)
	}
	if hasAlphabet && hasUpperCase {
		delete(set, characterSetUppercase)
	}

	var buf strings.Builder
	for _, cs := range allCharacterSets {
		if _, ok := set[cs]; ok {
			if err := cs.Append(&buf); err != nil {
				return "", err
			}
		}
	}

	return buf.String(), nil
}

func getMinLength(policy *config.PasswordPolicyConfig) int {
	var minLength = 0
	if policy.MinLength != nil {
		minLength = *policy.MinLength
	}

	// Ensure min length is at least the default.
	if minLength < DefaultMinLength {
		minLength = DefaultMinLength
	}

	// Override min length if guessable level is enabled to ensure the password is strong enough.
	if policy.MinimumGuessableLevel > 0 && minLength < GuessableEnabledMinLength {
		minLength = GuessableEnabledMinLength
	}

	return minLength
}

// pickRandByte returns a random byte from the given character list.
// It avoids modulo bias by rejecting bytes that are outside the valid range.
func (g *Generator) pickRandByte(charList string) (byte, error) {
	for {
		randomByte, err := g.RandSource.RandomBytes(1)
		if err != nil {
			return 0, err
		}
		b := randomByte[0]

		maxByte := 256
		if int(b) < maxByte-maxByte%len(charList) {
			return charList[int(b)%len(charList)], nil
		}
	}
}

func (g *Generator) checkPassword(password string) error {
	return g.Checker.ValidateCurrentPassword(password)
}