package authzen

import (
	"github.com/google/wire"
)

var DependencySet = wire.NewSet(
	wire.Struct(new(CallerResolver), "*"),
	wire.Struct(new(MetadataHandler), "*"),
	wire.Struct(new(EvaluationHandler), "*"),
	wire.Struct(new(EvaluationsHandler), "*"),
)
