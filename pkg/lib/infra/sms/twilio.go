package sms

import (
	"context"
	"errors"
	"fmt"

	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/sms/smsapi"
)

var ErrMissingTwilioConfiguration = errors.New("twilio: configuration is missing")

type TwilioClientCredentials struct {
	AccountSID          string
	AuthToken           string
	MessagingServiceSID string
}

func (TwilioClientCredentials) smsClientCredentials() {}

type TwilioClient struct {
	TwilioClient        *twilio.RestClient
	MessagingServiceSID string
}

func NewTwilioClient(c *config.TwilioCredentials) *TwilioClient {
	if c == nil {
		return nil
	}

	return &TwilioClient{
		TwilioClient: twilio.NewRestClientWithParams(twilio.ClientParams{
			Username: c.AccountSID,
			Password: c.AuthToken,
		}),
		MessagingServiceSID: c.MessagingServiceSID,
	}
}

func (t *TwilioClient) Send(ctx context.Context, opts smsapi.SendOptions) error {
	if t.TwilioClient == nil {
		return ErrMissingTwilioConfiguration
	}

	params := &api.CreateMessageParams{}
	params.SetBody(opts.Body)
	params.SetTo(opts.To)
	if t.MessagingServiceSID != "" {
		params.SetMessagingServiceSid(t.MessagingServiceSID)
	} else {
		params.SetFrom(opts.Sender)
	}

	_, err := t.TwilioClient.Api.CreateMessage(params)
	if err != nil {
		return fmt.Errorf("twilio: %w", err)
	}

	return nil
}
