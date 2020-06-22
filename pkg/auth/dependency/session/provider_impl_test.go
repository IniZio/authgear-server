package session

import (
	"math/rand"
	"net/http"
	"testing"

	"github.com/skygeario/skygear-server/pkg/auth/dependency/auth"
	"github.com/skygeario/skygear-server/pkg/core/authn"
	"github.com/skygeario/skygear-server/pkg/core/config"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/skygeario/skygear-server/pkg/clock"
)

type mockAccessEventProvider struct{}

func (*mockAccessEventProvider) InitStream(s auth.AuthSession) error {
	return nil
}

func TestProvider(t *testing.T) {
	Convey("Provider", t, func() {
		store := NewMockStore()

		clock := clock.NewMockClockAt("2020-01-01T00:00:00Z")
		initialTime := clock.Time

		req, _ := http.NewRequest("POST", "", nil)
		req.Header.Set("User-Agent", "SDK")
		req.Header.Set("X-Authgear-Extra-Info", "eyAiZGV2aWNlX25hbWUiOiAiRGV2aWNlIiB9")
		accessEvent := auth.AccessEvent{
			Timestamp: initialTime,
			UserAgent: "SDK",
			Extra: auth.AccessEventExtraInfo{
				"device_name": "Device",
			},
		}

		provider := &ProviderImpl{
			req:          req,
			store:        store,
			accessEvents: &mockAccessEventProvider{},
			config:       config.SessionConfiguration{},
			clock:        clock,
			rand:         rand.New(rand.NewSource(0)),
		}

		Convey("creating session", func() {
			Convey("should be successful", func() {
				session, token := provider.MakeSession(&authn.Attrs{
					UserID: "user-id",
				})
				err := provider.Create(session)

				So(err, ShouldBeNil)
				So(token, ShouldNotBeEmpty)
				So(session, ShouldResemble, &IDPSession{
					ID: session.ID,
					Attrs: authn.Attrs{
						UserID: "user-id",
					},
					AccessInfo: auth.AccessInfo{
						InitialAccess: accessEvent,
						LastAccess:    accessEvent,
					},
					CreatedAt: initialTime,
					TokenHash: session.TokenHash,
				})
			})
		})

		Convey("getting session", func() {
			fixtureSession := IDPSession{
				ID: "session-id",
				Attrs: authn.Attrs{
					UserID: "user-id",
				},
				CreatedAt: initialTime,
				TokenHash: "15be5b9c05673532b445d3295a86afd6b2615775e0233e9798cbe3c846a08d05",
			}
			store.Sessions[fixtureSession.ID] = fixtureSession

			Convey("should be successful using session token", func() {
				session, err := provider.GetByToken("session-id.token")
				So(err, ShouldBeNil)
				So(session, ShouldResemble, &fixtureSession)
			})

			Convey("should reject non-existent session", func() {
				session, err := provider.GetByToken("session-id-unknown.token")
				So(err, ShouldBeError, ErrSessionNotFound)
				So(session, ShouldBeNil)
			})

			Convey("should reject incorrect token", func() {
				session, err := provider.GetByToken("session-id.incorrect-token")
				So(err, ShouldBeError, ErrSessionNotFound)
				So(session, ShouldBeNil)

				session, err = provider.GetByToken("invalid-token")
				So(err, ShouldBeError, ErrSessionNotFound)
				So(session, ShouldBeNil)
			})
			Convey("should reject if session is expired", func() {
				clock.AdvanceSeconds(1000000)
				session, err := provider.GetByToken("session-id.token")
				So(err, ShouldBeError, ErrSessionNotFound)
				So(session, ShouldBeNil)
			})
		})
	})
}
