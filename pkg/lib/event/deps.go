package event

import (
	"context"
	"net/http"

	"github.com/google/wire"

	"github.com/authgear/authgear-server/pkg/lib/audit"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/hook"
	"github.com/authgear/authgear-server/pkg/util/clock"
)

var DependencySet = wire.NewSet(
	NewLogger,
	NewService,
	wire.Struct(new(StoreImpl), "*"),
	wire.Struct(new(ResolverImpl), "*"),
	wire.Bind(new(Store), new(*StoreImpl)),
	wire.Bind(new(Resolver), new(*ResolverImpl)),
)

func NewService(
	ctx context.Context,
	request *http.Request,
	trustProxy config.TrustProxy,
	logger Logger,
	database Database,
	clock clock.Clock,
	localization *config.LocalizationConfig,
	store Store,
	resolver Resolver,
	hookSink *hook.Sink,
	auditSink *audit.Sink,
) *Service {
	return &Service{
		Context:      ctx,
		Request:      request,
		TrustProxy:   trustProxy,
		Logger:       logger,
		Database:     database,
		Clock:        clock,
		Localization: localization,
		Store:        store,
		Resolver:     resolver,
		Sinks:        []Sink{hookSink, auditSink},
	}
}
