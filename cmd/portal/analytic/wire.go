//go:build wireinject
// +build wireinject

package analytic

import (
	"context"

	"github.com/authgear/authgear-server/pkg/lib/analytic"
	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/lib/infra/redis"
	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/authgear/authgear-server/pkg/util/periodical"
	"github.com/google/wire"
)

func NewUserWeeklyReport(
	ctx context.Context,
	pool *db.Pool,
	databaseCredentials *config.DatabaseCredentials,
) *analytic.UserWeeklyReport {
	panic(wire.Build(
		DependencySet,
	))
}

func NewProjectWeeklyReport(
	ctx context.Context,
	pool *db.Pool,
	databaseCredentials *config.DatabaseCredentials,
	auditDatabaseCredentials *config.AuditDatabaseCredentials,
) *analytic.ProjectWeeklyReport {
	panic(wire.Build(
		DependencySet,
	))
}

func NewProjectMonthlyReport(
	ctx context.Context,
	pool *db.Pool,
	databaseCredentials *config.DatabaseCredentials,
	auditDatabaseCredentials *config.AuditDatabaseCredentials,
) *analytic.ProjectMonthlyReport {
	panic(wire.Build(
		DependencySet,
	))
}

func NewCountCollector(
	ctx context.Context,
	pool *db.Pool,
	databaseCredentials *config.DatabaseCredentials,
	auditDatabaseCredentials *config.AuditDatabaseCredentials,
	redisPool *redis.Pool,
	credentials *config.AnalyticRedisCredentials,
) *analytic.CountCollector {
	panic(wire.Build(
		DependencySet,
	))
}

func NewPeriodicalArgumentParser() *periodical.ArgumentParser {
	panic(wire.Build(
		clock.DependencySet,
		periodical.DependencySet,
	))
}
