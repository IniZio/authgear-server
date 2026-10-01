package authz

import (
	"context"
	"errors"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	. "github.com/smartystreets/goconvey/convey"

	"github.com/authgear/authgear-server/pkg/api"
	"github.com/authgear/authgear-server/pkg/api/model"
	dbinfra "github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
	"github.com/authgear/authgear-server/pkg/util/accesscontrol"
	"github.com/authgear/authgear-server/pkg/util/otelutil/oteldatabasesql"
)

type testPool struct {
	connPool oteldatabasesql.ConnPool_
}

func (p *testPool) Open(info dbinfra.ConnectionInfo, opts dbinfra.ConnectionOptions) (oteldatabasesql.ConnPool_, error) {
	return p.connPool, nil
}

func (p *testPool) Close() error { return nil }

func newTestAppDBHandle(t *testing.T) *appdb.Handle {
	t.Helper()
	connPool, err := oteldatabasesql.Open(oteldatabasesql.OpenOptions{
		DriverName: "sqlite3",
		DSN:        ":memory:",
	})
	So(err, ShouldBeNil)
	connPool.SetMaxOpenConns(1)
	connPool.SetMaxIdleConns(0)
	connPool.SetConnMaxLifetime(0)
	connPool.SetConnMaxIdleTime(0)

	return &appdb.Handle{
		HookHandle: &dbinfra.HookHandle{
			Pool: &testPool{connPool: connPool},
		},
	}
}

type fakeUsers struct {
	users map[string]*model.User
	calls int
	err   error
}

func (f *fakeUsers) Get(ctx context.Context, id string, role accesscontrol.Role) (*model.User, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	u, ok := f.users[id]
	if !ok {
		return nil, api.ErrUserNotFound
	}
	return u, nil
}

type fakeRoles struct {
	perms map[string][]Permission
	calls int
}

func (f *fakeRoles) ListEffectivePermissionsByUserID(ctx context.Context, userID string) ([]Permission, error) {
	f.calls++
	return f.perms[userID], nil
}

type fakeResources struct {
	uris  map[string]bool
	calls int
}

func (f *fakeResources) ResourceExists(ctx context.Context, uri string) (bool, error) {
	f.calls++
	return f.uris[uri], nil
}

type fakeVersions struct {
	version int64
	err     error
}

func (f *fakeVersions) Get(ctx context.Context) (int64, error) { return f.version, f.err }

type fakeCache struct {
	snaps  map[string]*PermissionSnapshot
	getErr error
	setErr error
	sets   int
}

func (f *fakeCache) Get(ctx context.Context, version int64, userID string) (*PermissionSnapshot, bool, error) {
	if f.getErr != nil {
		return nil, false, f.getErr
	}
	s, ok := f.snaps[userID]
	return s, ok, nil
}

func (f *fakeCache) Set(ctx context.Context, version int64, userID string, snap *PermissionSnapshot) error {
	f.sets++
	if f.setErr != nil {
		return f.setErr
	}
	f.snaps[userID] = snap
	return nil
}

func req(user, resource, action string) EvaluationRequest {
	return EvaluationRequest{
		Subject:  Subject{Type: "user", ID: user},
		Resource: Resource{Type: "resource", ID: resource},
		Action:   Action{Name: action},
	}
}

func TestServiceEvaluate(t *testing.T) {
	Convey("Service.Evaluate", t, func() {
		ctx := context.Background()
		users := &fakeUsers{users: map[string]*model.User{
			"alice":    {},
			"disabled": {IsDisabled: true},
			"anon":     {IsAnonymized: true},
		}}
		roles := &fakeRoles{perms: map[string][]Permission{
			"alice":    {{ResourceID: "https://api.example.com", Scope: "read"}},
			"disabled": {{ResourceID: "https://api.example.com", Scope: "read"}},
		}}
		resources := &fakeResources{uris: map[string]bool{"https://api.example.com": true}}
		versions := &fakeVersions{version: 1}
		cache := &fakeCache{snaps: map[string]*PermissionSnapshot{}}

		s := &Service{
			Database:  newTestAppDBHandle(t),
			Users:     users,
			Roles:     roles,
			Resources: resources,
			Versions:  versions,
			Cache:     cache,
		}

		const res = "https://api.example.com"

		Convey("grant via role", func() {
			d, info, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{true})
			So(info.CacheHit, ShouldBeFalse)
			So(cache.sets, ShouldEqual, 1)
		})

		Convey("disabled user", func() {
			d, _, err := s.Evaluate(ctx, []EvaluationRequest{req("disabled", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{false})
		})

		Convey("anonymized user", func() {
			d, _, err := s.Evaluate(ctx, []EvaluationRequest{req("anon", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{false})
		})

		Convey("unknown user", func() {
			d, _, err := s.Evaluate(ctx, []EvaluationRequest{req("nobody", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{false})
		})

		Convey("unknown resource", func() {
			d, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", "https://nope.example.com", "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{false})
		})

		Convey("unknown scope", func() {
			d, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "write")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{false})
		})

		Convey("user store error", func() {
			users.err = errors.New("boom")
			_, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldNotBeNil)
		})

		Convey("version error", func() {
			versions.err = errors.New("boom")
			_, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldNotBeNil)
		})

		Convey("batch semantics", func() {
			batch := []EvaluationRequest{
				req("alice", res, "write"), // false
				req("alice", res, "read"),  // true
				req("alice", res, "admin"), // false
			}

			Convey("execute_all", func() {
				d, _, err := s.Evaluate(ctx, batch, EvaluationsSemanticExecuteAll)
				So(err, ShouldBeNil)
				So(d, ShouldResemble, []bool{false, true, false})
			})

			Convey("deny_on_first_deny", func() {
				d, _, err := s.Evaluate(ctx, batch, EvaluationsSemanticDenyOnFirstDeny)
				So(err, ShouldBeNil)
				So(d, ShouldResemble, []bool{false})

				d, _, err = s.Evaluate(ctx, batch[1:2], EvaluationsSemanticDenyOnFirstDeny)
				So(err, ShouldBeNil)
				So(d, ShouldResemble, []bool{true})
			})

			Convey("permit_on_first_permit", func() {
				d, _, err := s.Evaluate(ctx, batch, EvaluationsSemanticPermitOnFirstPermit)
				So(err, ShouldBeNil)
				So(d, ShouldResemble, []bool{false, true})
			})

			Convey("looks up each user and resource once", func() {
				_, _, err := s.Evaluate(ctx, batch, EvaluationsSemanticExecuteAll)
				So(err, ShouldBeNil)
				So(users.calls, ShouldEqual, 1)
				So(resources.calls, ShouldEqual, 1)
			})
		})

		Convey("cache hit skips DB", func() {
			cache.snaps["alice"] = &PermissionSnapshot{Grants: []string{res + " read"}}
			d, info, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{true})
			So(info.CacheHit, ShouldBeTrue)
			So(users.calls, ShouldEqual, 0)
			So(roles.calls, ShouldEqual, 0)
			So(cache.sets, ShouldEqual, 0)
		})

		Convey("second call hits cache", func() {
			_, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			d, info, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{true})
			So(info.CacheHit, ShouldBeTrue)
			So(users.calls, ShouldEqual, 1)
		})

		Convey("cache read error", func() {
			cache.getErr = errors.New("redis down")
			_, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeError, "redis down")
		})

		Convey("cache write error still decides", func() {
			cache.setErr = errors.New("redis down")
			d, _, err := s.Evaluate(ctx, []EvaluationRequest{req("alice", res, "read")}, EvaluationsSemanticExecuteAll)
			So(err, ShouldBeNil)
			So(d, ShouldResemble, []bool{true})
			So(cache.sets, ShouldEqual, 1)
		})
	})
}
