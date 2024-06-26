package facade

import (
	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/lib/rolesgroups"
	"github.com/authgear/authgear-server/pkg/util/graphqlutil"
)

type RolesGroupsCommands interface {
	CreateRole(options *rolesgroups.NewRoleOptions) (*model.Role, error)
	UpdateRole(options *rolesgroups.UpdateRoleOptions) (*model.Role, error)
	DeleteRole(id string) error

	CreateGroup(options *rolesgroups.NewGroupOptions) (*model.Group, error)
	UpdateGroup(options *rolesgroups.UpdateGroupOptions) (*model.Group, error)
	DeleteGroup(id string) error

	AddRoleToGroups(options *rolesgroups.AddRoleToGroupsOptions) (*model.Role, error)
	RemoveRoleFromGroups(options *rolesgroups.RemoveRoleFromGroupsOptions) (*model.Role, error)

	AddRoleToUsers(options *rolesgroups.AddRoleToUsersOptions) (*model.Role, error)
	RemoveRoleFromUsers(options *rolesgroups.RemoveRoleFromUsersOptions) (*model.Role, error)

	AddGroupToUsers(options *rolesgroups.AddGroupToUsersOptions) (*model.Group, error)
	RemoveGroupFromUsers(options *rolesgroups.RemoveGroupFromUsersOptions) (*model.Group, error)

	AddGroupToRoles(options *rolesgroups.AddGroupToRolesOptions) (*model.Group, error)
	RemoveGroupFromRoles(options *rolesgroups.RemoveGroupFromRolesOptions) (*model.Group, error)

	AddUserToRoles(options *rolesgroups.AddUserToRolesOptions) error
	RemoveUserFromRoles(options *rolesgroups.RemoveUserFromRolesOptions) error

	AddUserToGroups(options *rolesgroups.AddUserToGroupsOptions) error
	RemoveUserFromGroups(options *rolesgroups.RemoveUserFromGroupsOptions) error
}

type RolesGroupsQueries interface {
	GetRole(id string) (*model.Role, error)
	GetGroup(id string) (*model.Group, error)
	ListRoles(options *rolesgroups.ListRolesOptions, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, error)
	ListGroups(options *rolesgroups.ListGroupsOptions, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, error)
	ListGroupsByRoleID(roleID string) ([]*model.Group, error)
	ListRolesByGroupID(groupID string) ([]*model.Role, error)
	ListRolesByUserID(userID string) ([]*model.Role, error)
	ListGroupsByUserID(userID string) ([]*model.Group, error)
	ListUserIDsByRoleID(roleID string, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, error)
	ListUserIDsByGroupID(groupID string, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, error)
	ListEffectiveRolesByUserID(userID string) ([]*model.Role, error)
	ListAllUserIDsByGroupIDs(groupIDs []string) ([]string, error)
	ListAllUserIDsByGroupKeys(groupKeys []string) ([]string, error)
	ListAllUserIDsByRoleIDs(roleIDs []string) ([]string, error)
	ListAllUserIDsByEffectiveRoleIDs(roleIDs []string) ([]string, error)
	ListAllRolesByKeys(keys []string) ([]*model.Role, error)
	ListAllGroupsByKeys(keys []string) ([]*model.Group, error)
	CountRoles() (uint64, error)
	CountGroups() (uint64, error)
}

type RolesGroupsFacade struct {
	RolesGroupsCommands RolesGroupsCommands
	RolesGroupsQueries  RolesGroupsQueries
}

func (f *RolesGroupsFacade) CreateRole(options *rolesgroups.NewRoleOptions) (roleID string, err error) {
	r, err := f.RolesGroupsCommands.CreateRole(options)
	if err != nil {
		return
	}

	roleID = r.ID
	return
}

func (f *RolesGroupsFacade) UpdateRole(options *rolesgroups.UpdateRoleOptions) (err error) {
	_, err = f.RolesGroupsCommands.UpdateRole(options)
	if err != nil {
		return
	}

	return
}

func (f *RolesGroupsFacade) DeleteRole(id string) (err error) {
	return f.RolesGroupsCommands.DeleteRole(id)
}

func (f *RolesGroupsFacade) ListRoles(options *rolesgroups.ListRolesOptions, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, *graphqlutil.PageResult, error) {
	refs, err := f.RolesGroupsQueries.ListRoles(options, pageArgs)
	if err != nil {
		return nil, nil, err
	}

	count, err := f.RolesGroupsQueries.CountRoles()
	if err != nil {
		return nil, nil, err
	}

	return refs, graphqlutil.NewPageResult(pageArgs, len(refs), graphqlutil.NewLazy(func() (interface{}, error) {
		return count, nil
	})), nil
}

func (f *RolesGroupsFacade) ListGroupsByRoleID(roleID string) ([]*model.Group, error) {
	return f.RolesGroupsQueries.ListGroupsByRoleID(roleID)
}

func (f *RolesGroupsFacade) CreateGroup(options *rolesgroups.NewGroupOptions) (groupID string, err error) {
	g, err := f.RolesGroupsCommands.CreateGroup(options)
	if err != nil {
		return
	}

	groupID = g.ID
	return
}

func (f *RolesGroupsFacade) UpdateGroup(options *rolesgroups.UpdateGroupOptions) (err error) {
	_, err = f.RolesGroupsCommands.UpdateGroup(options)
	if err != nil {
		return
	}

	return
}

func (f *RolesGroupsFacade) DeleteGroup(id string) (err error) {
	return f.RolesGroupsCommands.DeleteGroup(id)
}

func (f *RolesGroupsFacade) ListGroups(options *rolesgroups.ListGroupsOptions, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, *graphqlutil.PageResult, error) {
	refs, err := f.RolesGroupsQueries.ListGroups(options, pageArgs)
	if err != nil {
		return nil, nil, err
	}

	count, err := f.RolesGroupsQueries.CountGroups()
	if err != nil {
		return nil, nil, err
	}

	return refs, graphqlutil.NewPageResult(pageArgs, len(refs), graphqlutil.NewLazy(func() (interface{}, error) {
		return count, nil
	})), nil
}

func (f *RolesGroupsFacade) ListRolesByGroupID(groupID string) ([]*model.Role, error) {
	return f.RolesGroupsQueries.ListRolesByGroupID(groupID)
}

func (f *RolesGroupsFacade) AddRoleToGroups(options *rolesgroups.AddRoleToGroupsOptions) (roleID string, err error) {
	r, err := f.RolesGroupsCommands.AddRoleToGroups(options)
	if err != nil {
		return
	}

	roleID = r.ID
	return
}

func (f *RolesGroupsFacade) RemoveRoleFromGroups(options *rolesgroups.RemoveRoleFromGroupsOptions) (roleID string, err error) {
	r, err := f.RolesGroupsCommands.RemoveRoleFromGroups(options)
	if err != nil {
		return
	}

	roleID = r.ID
	return
}

func (f *RolesGroupsFacade) AddRoleToUsers(options *rolesgroups.AddRoleToUsersOptions) (roleID string, err error) {
	r, err := f.RolesGroupsCommands.AddRoleToUsers(options)
	if err != nil {
		return
	}

	roleID = r.ID
	return
}

func (f *RolesGroupsFacade) RemoveRoleFromUsers(options *rolesgroups.RemoveRoleFromUsersOptions) (roleID string, err error) {
	r, err := f.RolesGroupsCommands.RemoveRoleFromUsers(options)
	if err != nil {
		return
	}

	roleID = r.ID
	return
}

func (f *RolesGroupsFacade) AddGroupToUsers(options *rolesgroups.AddGroupToUsersOptions) (groupID string, err error) {
	r, err := f.RolesGroupsCommands.AddGroupToUsers(options)
	if err != nil {
		return
	}

	groupID = r.ID
	return
}

func (f *RolesGroupsFacade) RemoveGroupFromUsers(options *rolesgroups.RemoveGroupFromUsersOptions) (groupID string, err error) {
	r, err := f.RolesGroupsCommands.RemoveGroupFromUsers(options)
	if err != nil {
		return
	}

	groupID = r.ID
	return
}

func (f *RolesGroupsFacade) AddGroupToRoles(options *rolesgroups.AddGroupToRolesOptions) (groupID string, err error) {
	r, err := f.RolesGroupsCommands.AddGroupToRoles(options)
	if err != nil {
		return
	}

	groupID = r.ID
	return
}

func (f *RolesGroupsFacade) RemoveGroupFromRoles(options *rolesgroups.RemoveGroupFromRolesOptions) (groupID string, err error) {
	r, err := f.RolesGroupsCommands.RemoveGroupFromRoles(options)
	if err != nil {
		return
	}

	groupID = r.ID
	return
}

func (f *RolesGroupsFacade) AddUserToRoles(options *rolesgroups.AddUserToRolesOptions) (err error) {
	err = f.RolesGroupsCommands.AddUserToRoles(options)
	if err != nil {
		return
	}

	return
}

func (f *RolesGroupsFacade) RemoveUserFromRoles(options *rolesgroups.RemoveUserFromRolesOptions) (err error) {
	err = f.RolesGroupsCommands.RemoveUserFromRoles(options)
	if err != nil {
		return
	}

	return
}

func (f *RolesGroupsFacade) AddUserToGroups(options *rolesgroups.AddUserToGroupsOptions) (err error) {
	err = f.RolesGroupsCommands.AddUserToGroups(options)
	if err != nil {
		return
	}

	return
}

func (f *RolesGroupsFacade) RemoveUserFromGroups(options *rolesgroups.RemoveUserFromGroupsOptions) (err error) {
	err = f.RolesGroupsCommands.RemoveUserFromGroups(options)
	if err != nil {
		return
	}

	return
}

func (f *RolesGroupsFacade) ListRolesByUserID(userID string) ([]*model.Role, error) {
	return f.RolesGroupsQueries.ListRolesByUserID(userID)
}

func (f *RolesGroupsFacade) ListGroupsByUserID(userID string) ([]*model.Group, error) {
	return f.RolesGroupsQueries.ListGroupsByUserID(userID)
}

func (f *RolesGroupsFacade) ListUserIDsByRoleID(roleID string, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, *graphqlutil.PageResult, error) {
	refs, err := f.RolesGroupsQueries.ListUserIDsByRoleID(roleID, pageArgs)
	if err != nil {
		return nil, nil, err
	}

	return refs, graphqlutil.NewPageResult(pageArgs, len(refs), graphqlutil.NewLazy(func() (interface{}, error) {
		// No need to report the total number of groups. So we return nil here.
		return nil, nil
	})), nil
}

func (f *RolesGroupsFacade) ListAllUserIDsByGroupIDs(groupIDs []string) ([]string, error) {
	return f.RolesGroupsQueries.ListAllUserIDsByGroupIDs(groupIDs)
}

func (f *RolesGroupsFacade) ListAllUserIDsByGroupKeys(groupKeys []string) ([]string, error) {
	return f.RolesGroupsQueries.ListAllUserIDsByGroupKeys(groupKeys)
}

func (f *RolesGroupsFacade) ListUserIDsByGroupID(groupID string, pageArgs graphqlutil.PageArgs) ([]model.PageItemRef, *graphqlutil.PageResult, error) {
	refs, err := f.RolesGroupsQueries.ListUserIDsByGroupID(groupID, pageArgs)
	if err != nil {
		return nil, nil, err
	}

	return refs, graphqlutil.NewPageResult(pageArgs, len(refs), graphqlutil.NewLazy(func() (interface{}, error) {
		// No need to report the total number of groups. So we return nil here.
		return nil, nil
	})), nil
}

func (f *RolesGroupsFacade) ListEffectiveRolesByUserID(userID string) ([]*model.Role, error) {
	return f.RolesGroupsQueries.ListEffectiveRolesByUserID(userID)
}

func (f *RolesGroupsFacade) ListAllUserIDsByEffectiveRoleIDs(roleIDs []string) ([]string, error) {
	return f.RolesGroupsQueries.ListAllUserIDsByEffectiveRoleIDs(roleIDs)
}

func (f *RolesGroupsFacade) ListAllUserIDsByRoleIDs(roleIDs []string) ([]string, error) {
	return f.RolesGroupsQueries.ListAllUserIDsByRoleIDs(roleIDs)
}

func (f *RolesGroupsFacade) ListAllRolesByKeys(keys []string) ([]*model.Role, error) {
	return f.RolesGroupsQueries.ListAllRolesByKeys(keys)
}

func (f *RolesGroupsFacade) ListAllGroupsByKeys(keys []string) ([]*model.Group, error) {
	return f.RolesGroupsQueries.ListAllGroupsByKeys(keys)
}

func (f *RolesGroupsFacade) GetRole(roleID string) (*model.Role, error) {
	return f.RolesGroupsQueries.GetRole(roleID)
}

func (f *RolesGroupsFacade) GetGroup(groupID string) (*model.Group, error) {
	return f.RolesGroupsQueries.GetGroup(groupID)
}
