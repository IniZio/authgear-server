package authenticationflow

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	goredis "github.com/go-redis/redis/v8"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis/appredis"
	"github.com/authgear/authgear-server/pkg/util/pubsub"
)

const (
	WebsocketEndpointV1 = "/api/v1/authentication_flows/ws"
)

func WebsocketChannelName(r *http.Request) string {
	channel := r.FormValue("channel")
	return channel
}

func WebsocketURL(origin string, channel string) (websocketURL string, err error) {
	u, err := url.Parse(origin)
	if err != nil {
		return
	}

	// Change scheme
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}

	// Construct path
	u = u.JoinPath(WebsocketEndpointV1)

	// Construct query
	q := u.Query()
	q.Set("channel", channel)
	u.RawQuery = q.Encode()

	websocketURL = u.String()
	return
}

type websocketRedisPool struct{ *appredis.Handle }

func (p websocketRedisPool) Get() *goredis.Client {
	return p.Handle.Client()
}

type WebsocketEventStore struct {
	AppID       config.AppID
	RedisHandle *appredis.Handle
	Store       Store
	publisher   *pubsub.Publisher
}

func NewWebsocketEventStore(appID config.AppID, handle *appredis.Handle, store Store) *WebsocketEventStore {
	s := &WebsocketEventStore{
		AppID:       appID,
		RedisHandle: handle,
		Store:       store,
		publisher:   &pubsub.Publisher{RedisPool: websocketRedisPool{handle}},
	}
	return s
}

func (s *WebsocketEventStore) Publish(websocketChannelName string, e Event) error {
	channelName := s.ChannelName(websocketChannelName)

	b, err := json.Marshal(e)
	if err != nil {
		return err
	}

	err = s.publisher.Publish(channelName, b)
	if err != nil {
		return err
	}

	return nil
}

func (s *WebsocketEventStore) ChannelName(websocketChannelName string) string {
	return fmt.Sprintf("app:%s:authenticationflow-events:%s", s.AppID, websocketChannelName)
}
