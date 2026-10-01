package rolesgroups

import (
	"context"

	"github.com/lib/pq"

	"github.com/authgear/authgear-server/pkg/lib/infra/db"
	"github.com/authgear/authgear-server/pkg/util/uuid"
)

func (s *Store) AddScopesToRole(ctx context.Context, roleID string, scopeIDs []string) error {
	now := s.Clock.NowUTC()
	for _, scopeID := range scopeIDs {
		q := s.SQLBuilder.
			Insert(s.SQLBuilder.TableName("_auth_role_resource_scope")).
			Columns(
				"id",
				"created_at",
				"updated_at",
				"role_id",
				"scope_id",
			).
			Values(
				uuid.New(),
				now,
				now,
				roleID,
				scopeID,
			).Suffix("ON CONFLICT DO NOTHING")

		_, err := s.SQLExecutor.ExecWith(ctx, q)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) RemoveScopesFromRole(ctx context.Context, roleID string, scopeIDs []string) error {
	q := s.SQLBuilder.
		Delete(s.SQLBuilder.TableName("_auth_role_resource_scope")).
		Where("role_id = ? AND scope_id = ANY (?)", roleID, pq.Array(scopeIDs))

	_, err := s.SQLExecutor.ExecWith(ctx, q)
	return err
}

func (s *Store) ListScopeIDsByRoleID(ctx context.Context, roleID string) ([]string, error) {
	q := s.SQLBuilder.Select("scope_id").
		From(s.SQLBuilder.TableName("_auth_role_resource_scope")).
		Where("role_id = ?", roleID).
		OrderBy("created_at")

	return s.queryStrings(ctx, q)
}

func (s *Store) ListRoleIDsByScopeID(ctx context.Context, scopeID string) ([]string, error) {
	q := s.SQLBuilder.Select("role_id").
		From(s.SQLBuilder.TableName("_auth_role_resource_scope")).
		Where("scope_id = ?", scopeID).
		OrderBy("created_at")

	return s.queryStrings(ctx, q)
}

// ListEffectivePermissionsByUserID returns permissions of roles held directly or via groups.
func (s *Store) ListEffectivePermissionsByUserID(ctx context.Context, userID string) ([]Permission, error) {
	q := s.SQLBuilder.Select("rs.resource_id", "rs.scope").
		From(s.SQLBuilder.TableName("_auth_role_resource_scope"), "rrs").
		Join(s.SQLBuilder.TableName("_auth_resource_scope"), "rs", "rrs.scope_id = rs.id").
		Where(
			"rrs.role_id IN ("+
				"SELECT ur.role_id FROM "+s.SQLBuilder.TableName("_auth_user_role")+" ur WHERE ur.user_id = ? "+
				"UNION "+
				"SELECT gr.role_id FROM "+s.SQLBuilder.TableName("_auth_user_group")+" ug "+
				"JOIN "+s.SQLBuilder.TableName("_auth_group_role")+" gr ON ug.group_id = gr.group_id "+
				"WHERE ug.user_id = ?)",
			userID, userID,
		).
		GroupBy("rs.resource_id", "rs.scope")

	rows, err := s.SQLExecutor.QueryWith(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.ResourceID, &p.Scope); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return perms, nil
}

func (s *Store) queryStrings(ctx context.Context, q db.SelectBuilder) ([]string, error) {
	rows, err := s.SQLExecutor.QueryWith(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
