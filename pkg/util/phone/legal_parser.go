package phone

import (
	"regexp"
	"strconv"

	"github.com/nyaruka/phonenumbers"
)

// LegalParser parses a legal phone number. A legal phone number is a phone number that passes phonenumbers.Parse().
type legalParser struct{}

func (p *legalParser) ParseInputPhoneNumber(phone string) (e164 string, err error) {
	isNumericString, _ := regexp.Match(`^\+[0-9\ \-]*$`, []byte(phone))
	if !isNumericString {
		err = ErrNotInE164Format
		return
	}
	num, err := phonenumbers.Parse(phone, "")
	if err != nil {
		err = ErrNotInE164Format
		return
	}
	isPhonePossible := phonenumbers.IsPossibleNumber(num)
	if !isPhonePossible {
		err = ErrPhoneNumberInvalid
		return
	}
	e164 = phonenumbers.Format(num, phonenumbers.E164)
	return
}

func (p *legalParser) SplitE164(e164 string) (nationalNumber string, countryCallingCode string, err error) {
	err = p.CheckE164(e164)
	if err != nil {
		return
	}

	num, err := phonenumbers.Parse(e164, "")
	if err != nil {
		return
	}
	countryCallingCode = strconv.Itoa(int(num.GetCountryCode()))
	nationalNumber = phonenumbers.GetNationalSignificantNumber(num)
	return
}

func (p *legalParser) CheckE164(phone string) error {
	formatted, err := p.ParseInputPhoneNumber(phone)
	if err != nil {
		return err
	}
	if formatted != phone {
		return ErrNotInE164Format
	}
	return nil
}
