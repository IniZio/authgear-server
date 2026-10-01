package rolesgroups

import (
	"testing"

	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
)

func TestEffectivePermissionsQuery(t *testing.T) {
	Convey("effectivePermissionsQuery", t, func() {
		b := &appdb.SQLBuilderApp{SQLBuilderApp: db.NewSQLBuilderApp("auth", "app")}
		sql, _, err := effectivePermissionsQuery(b, "user1").ToSql()
		So(err, ShouldBeNil)
		So(sql, ShouldContainSubstring, "SELECT r.uri, rs.scope")
		So(sql, ShouldContainSubstring, "\"_auth_resource\" AS r ON rs.resource_id = r.id")
		So(sql, ShouldContainSubstring, "GROUP BY r.uri, rs.scope")
		So(sql, ShouldContainSubstring, "ORDER BY r.uri, rs.scope")
		So(sql, ShouldNotContainSubstring, "rs.resource_id,")
	})
}
