package rolesgroups

import (
	"context"

	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/authz"
	"github.com/authgear/authgear-server/pkg/lib/resourcescope"
)

type Commands struct {
	Store              *Store
	ResourceScopeStore *resourcescope.Store
	AuthzInvalidator   authz.CacheInvalidator
}

type AddScopesToRoleOptions struct {
	RoleKey     string
	ResourceURI string
	Scopes      []string
}

type RemoveScopesFromRoleOptions struct {
	RoleKey     string
	ResourceURI string
	Scopes      []string
}

// resolveRoleScopes returns the role and the IDs of the scopes.
// Any unknown scope fails with ErrScopeNotFound.
func (c *Commands) resolveRoleScopes(ctx context.Context, roleKey string, resourceURI string, scopes []string) (*Role, []string, error) {
	if len(scopes) == 0 {
		return nil, nil, ErrEmptyScopes
	}

	role, err := c.Store.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, nil, err
	}

	resource, err := c.ResourceScopeStore.GetResourceByURI(ctx, resourceURI)
	if err != nil {
		return nil, nil, err
	}

	found, err := c.ResourceScopeStore.GetScopesByResourceIDAndScopes(ctx, resource.ID, scopes)
	if err != nil {
		return nil, nil, err
	}

	scopeIDs := make([]string, 0, len(scopes))
	for _, name := range scopes {
		sc, ok := found[name]
		if !ok {
			return nil, nil, resourcescope.ErrScopeNotFound
		}
		scopeIDs = append(scopeIDs, sc.ID)
	}
	return role, scopeIDs, nil
}

func (c *Commands) AddScopesToRole(ctx context.Context, options *AddScopesToRoleOptions) (*model.Role, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	role, scopeIDs, err := c.resolveRoleScopes(ctx, options.RoleKey, options.ResourceURI, options.Scopes)
	if err != nil {
		return nil, err
	}
	err = c.Store.AddScopesToRole(ctx, role.ID, scopeIDs)
	if err != nil {
		return nil, err
	}
	return role.ToModel(), nil
}

func (c *Commands) RemoveScopesFromRole(ctx context.Context, options *RemoveScopesFromRoleOptions) (*model.Role, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	role, scopeIDs, err := c.resolveRoleScopes(ctx, options.RoleKey, options.ResourceURI, options.Scopes)
	if err != nil {
		return nil, err
	}
	err = c.Store.RemoveScopesFromRole(ctx, role.ID, scopeIDs)
	if err != nil {
		return nil, err
	}
	return role.ToModel(), nil
}

func (c *Commands) CreateRole(ctx context.Context, options *NewRoleOptions) (*model.Role, error) {
	err := ValidateKey(ctx, options.Key)
	if err != nil {
		return nil, err
	}

	role := c.Store.NewRole(options)
	err = c.Store.CreateRole(ctx, role)
	if err != nil {
		return nil, err
	}

	return role.ToModel(), nil
}

func (c *Commands) UpdateRole(ctx context.Context, options *UpdateRoleOptions) (*model.Role, error) {
	if options.RequireUpdate() {
		if options.NewKey != nil {
			err := ValidateKey(ctx, *options.NewKey)
			if err != nil {
				return nil, err
			}
		}

		err := c.Store.UpdateRole(ctx, options)
		if err != nil {
			return nil, err
		}
	}

	r, err := c.Store.GetRoleByID(ctx, options.ID)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) DeleteRole(ctx context.Context, id string) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	return c.Store.DeleteRole(ctx, id)
}

func (c *Commands) CreateGroup(ctx context.Context, options *NewGroupOptions) (*model.Group, error) {
	err := ValidateKey(ctx, options.Key)
	if err != nil {
		return nil, err
	}

	group := c.Store.NewGroup(options)
	err = c.Store.CreateGroup(ctx, group)
	if err != nil {
		return nil, err
	}

	return group.ToModel(), nil
}

func (c *Commands) UpdateGroup(ctx context.Context, options *UpdateGroupOptions) (*model.Group, error) {
	if options.RequireUpdate() {
		if options.NewKey != nil {
			err := ValidateKey(ctx, *options.NewKey)
			if err != nil {
				return nil, err
			}
		}

		err := c.Store.UpdateGroup(ctx, options)
		if err != nil {
			return nil, err
		}
	}

	r, err := c.Store.GetGroupByID(ctx, options.ID)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) DeleteGroup(ctx context.Context, id string) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	return c.Store.DeleteGroup(ctx, id)
}

func (c *Commands) AddRoleToGroups(ctx context.Context, options *AddRoleToGroupsOptions) (*model.Role, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.AddRoleToGroups(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) RemoveRoleFromGroups(ctx context.Context, options *RemoveRoleFromGroupsOptions) (*model.Role, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.RemoveRoleFromGroups(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) AddRoleToUsers(ctx context.Context, options *AddRoleToUsersOptions) (*model.Role, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.AddRoleToUsers(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) RemoveRoleFromUsers(ctx context.Context, options *RemoveRoleFromUsersOptions) (*model.Role, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.RemoveRoleFromUsers(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) AddGroupToUsers(ctx context.Context, options *AddGroupToUsersOptions) (*model.Group, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.AddGroupToUsers(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) RemoveGroupFromUsers(ctx context.Context, options *RemoveGroupFromUsersOptions) (*model.Group, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.RemoveGroupFromUsers(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) AddGroupToRoles(ctx context.Context, options *AddGroupToRolesOptions) (*model.Group, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.AddGroupToRoles(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) RemoveGroupFromRoles(ctx context.Context, options *RemoveGroupFromRolesOptions) (*model.Group, error) {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	r, err := c.Store.RemoveGroupFromRoles(ctx, options)
	if err != nil {
		return nil, err
	}

	return r.ToModel(), nil
}

func (c *Commands) AddUserToRoles(ctx context.Context, options *AddUserToRolesOptions) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.AddUserToRoles(ctx, options)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) RemoveUserFromRoles(ctx context.Context, options *RemoveUserFromRolesOptions) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.RemoveUserFromRoles(ctx, options)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) AddUserToGroups(ctx context.Context, options *AddUserToGroupsOptions) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.AddUserToGroups(ctx, options)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) RemoveUserFromGroups(ctx context.Context, options *RemoveUserFromGroupsOptions) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.RemoveUserFromGroups(ctx, options)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) DeleteUserGroup(ctx context.Context, userID string) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.DeleteUserGroup(ctx, userID)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) DeleteUserRole(ctx context.Context, userID string) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.DeleteUserRole(ctx, userID)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) ResetUserGroup(ctx context.Context, options *ResetUserGroupOptions) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.ResetUserGroup(ctx, options)
	if err != nil {
		return err
	}

	return nil
}

func (c *Commands) ResetUserRole(ctx context.Context, options *ResetUserRoleOptions) error {
	c.AuthzInvalidator.InvalidateAfterCommit(ctx)
	err := c.Store.ResetUserRole(ctx, options)
	if err != nil {
		return err
	}

	return nil
}
