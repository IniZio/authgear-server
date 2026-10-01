package authz

import (
	"github.com/google/wire"
)

var DependencySet = wire.NewSet(
	wire.Struct(new(Service), "*"),
	wire.Struct(new(PermissionCache), "*"),
	wire.Struct(new(VersionStore), "*"),
	wire.Struct(new(Invalidator), "*"),
	wire.Bind(new(VersionGetter), new(*VersionStore)),
	wire.Bind(new(SnapshotCache), new(*PermissionCache)),
)
