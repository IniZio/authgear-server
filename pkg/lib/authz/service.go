package authz

import (
	"context"
	"time"

	"github.com/authgear/authgear-server/pkg/api"
	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/appdb"
	"github.com/authgear/authgear-server/pkg/util/accesscontrol"
	"github.com/authgear/authgear-server/pkg/util/slogutil"
)

var ServiceLogger = slogutil.NewLogger("authz")

type Subject struct {
	Type string
	ID   string
}

type Resource struct {
	Type string
	ID   string
}

type Action struct {
	Name string
}

type EvaluationRequest struct {
	Subject  Subject
	Resource Resource
	Action   Action
	Context  map[string]any
}

type EvaluationsSemantic string

const (
	EvaluationsSemanticExecuteAll          EvaluationsSemantic = "execute_all"
	EvaluationsSemanticDenyOnFirstDeny     EvaluationsSemantic = "deny_on_first_deny"
	EvaluationsSemanticPermitOnFirstPermit EvaluationsSemantic = "permit_on_first_permit"
)

// ParseEvaluationsSemantic returns the default for "" and ok=false for unknown values.
func ParseEvaluationsSemantic(s string) (EvaluationsSemantic, bool) {
	switch EvaluationsSemantic(s) {
	case "":
		return EvaluationsSemanticExecuteAll, true
	case EvaluationsSemanticExecuteAll, EvaluationsSemanticDenyOnFirstDeny, EvaluationsSemanticPermitOnFirstPermit:
		return EvaluationsSemantic(s), true
	}
	return "", false
}

type EvaluationInfo struct {
	// CacheHit is true when every snapshot used came from the cache.
	CacheHit bool
	Elapsed  time.Duration
}

type UserQueries interface {
	Get(ctx context.Context, id string, role accesscontrol.Role) (*model.User, error)
}

type PermissionQueries interface {
	ListEffectivePermissionsByUserID(ctx context.Context, userID string) ([]Permission, error)
}

// ResourceQueries reports whether a Resource with the URI exists.
// The adapter maps resourcescope.ErrResourceNotFound to (false, nil).
type ResourceQueries interface {
	ResourceExists(ctx context.Context, uri string) (bool, error)
}

type VersionGetter interface {
	Get(ctx context.Context) (int64, error)
}

type SnapshotCache interface {
	Get(ctx context.Context, version int64, userID string) (*PermissionSnapshot, bool, error)
	Set(ctx context.Context, version int64, userID string, snap *PermissionSnapshot) error
}

type Service struct {
	Database  *appdb.Handle
	Users     UserQueries
	Roles     PermissionQueries
	Resources ResourceQueries
	Versions  VersionGetter
	Cache     SnapshotCache
}

func (s *Service) Evaluate(ctx context.Context, reqs []EvaluationRequest, semantic EvaluationsSemantic) (decisions []bool, info EvaluationInfo, err error) {
	start := time.Now()
	defer func() { info.Elapsed = time.Since(start) }()

	version, err := s.Versions.Get(ctx)
	if err != nil {
		return nil, info, err
	}

	allHit := true
	snapshots := map[string]*PermissionSnapshot{}
	resources := map[string]bool{}

	decisions = make([]bool, 0, len(reqs))
	for _, req := range reqs {
		snap, ok := snapshots[req.Subject.ID]
		if !ok {
			var hit bool
			snap, hit, err = s.loadSnapshot(ctx, version, req.Subject.ID)
			if err != nil {
				return nil, info, err
			}
			allHit = allHit && hit
			snapshots[req.Subject.ID] = snap
		}

		exists, ok := resources[req.Resource.ID]
		if !ok {
			err = s.Database.ReadOnly(ctx, func(ctx context.Context) (err error) {
				exists, err = s.Resources.ResourceExists(ctx, req.Resource.ID)
				return
			})
			if err != nil {
				return nil, info, err
			}
			resources[req.Resource.ID] = exists
		}

		decision := exists && !snap.Disabled && containsGrant(snap.Grants, req.Resource.ID, req.Action.Name)
		decisions = append(decisions, decision)

		if semantic == EvaluationsSemanticDenyOnFirstDeny && !decision {
			break
		}
		if semantic == EvaluationsSemanticPermitOnFirstPermit && decision {
			break
		}
	}

	info.CacheHit = allHit
	return decisions, info, nil
}

func (s *Service) loadSnapshot(ctx context.Context, version int64, userID string) (snap *PermissionSnapshot, hit bool, err error) {
	snap, hit, err = s.Cache.Get(ctx, version, userID)
	if err != nil {
		return nil, false, err
	}
	if hit {
		return snap, true, nil
	}

	snap = &PermissionSnapshot{}
	err = s.Database.ReadOnly(ctx, func(ctx context.Context) error {
		user, err := s.Users.Get(ctx, userID, accesscontrol.RoleGreatest)
		if err != nil {
			if apierrors.IsKind(err, api.UserNotFound) {
				snap.Disabled = true
				return nil
			}
			return err
		}
		if user.IsDisabled || user.IsAnonymized {
			snap.Disabled = true
			return nil
		}

		perms, err := s.Roles.ListEffectivePermissionsByUserID(ctx, userID)
		if err != nil {
			return err
		}
		snap.Grants = make([]string, 0, len(perms))
		for _, p := range perms {
			snap.Grants = append(snap.Grants, grantKey(p.ResourceID, p.Scope))
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}

	if setErr := s.Cache.Set(ctx, version, userID, snap); setErr != nil {
		ServiceLogger.GetLogger(ctx).WithError(setErr).Warn(ctx, "failed to cache permission snapshot")
	}
	return snap, false, nil
}

func grantKey(resourceID string, scope string) string {
	return resourceID + " " + scope
}

func containsGrant(grants []string, resourceID string, scope string) bool {
	key := grantKey(resourceID, scope)
	for _, g := range grants {
		if g == key {
			return true
		}
	}
	return false
}
