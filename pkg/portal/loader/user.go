package loader

import (
	"fmt"
	"net/http"

	relay "github.com/authgear/graphql-go-relay"

	"github.com/authgear/authgear-server/pkg/portal/model"
	"github.com/authgear/authgear-server/pkg/portal/service"
	"github.com/authgear/authgear-server/pkg/util/graphqlutil"
)

type UserLoaderAppService interface {
	GetManyProjectQuota(userIDs []string) ([]int, error)
}

type UserLoaderCollaboratorService interface {
	GetManyProjectOwnerCount(userIDs []string) ([]int, error)
}

type UserLoaderAdminAPIService interface {
	SelfDirector(actorUserID string, usage service.Usage) (func(*http.Request), error)
}

type UserLoader struct {
	*graphqlutil.DataLoader `wire:"-"`

	AdminAPI      UserLoaderAdminAPIService
	Apps          UserLoaderAppService
	Collaborators UserLoaderCollaboratorService
}

func NewUserLoader(adminAPI UserLoaderAdminAPIService, apps UserLoaderAppService, collaborators UserLoaderCollaboratorService) *UserLoader {
	l := &UserLoader{
		AdminAPI:      adminAPI,
		Apps:          apps,
		Collaborators: collaborators,
	}
	l.DataLoader = graphqlutil.NewDataLoader(l.LoadFunc)
	return l
}

func (l *UserLoader) LoadFunc(keys []interface{}) ([]interface{}, error) {
	var globalIDs []string
	var ids []string
	for _, iface := range keys {
		key := iface.(string)
		globalIDs = append(globalIDs, relay.ToGlobalID("User", key))
		ids = append(ids, key)
	}

	params := graphqlutil.DoParams{
		OperationName: "getUserNodes",
		Query: `
		query getUserNodes($ids: [ID!]!) {
			nodes(ids: $ids) {
				... on User {
					id
					formattedName
					standardAttributes
				}
			}
		}
		`,
		Variables: map[string]interface{}{
			"ids": globalIDs,
		},
	}

	r, err := http.NewRequest("POST", "/graphql", nil)
	if err != nil {
		return nil, err
	}

	director, err := l.AdminAPI.SelfDirector("", service.UsageInternal)
	if err != nil {
		return nil, err
	}

	director(r)

	result, err := graphqlutil.HTTPDo(r, params)
	if err != nil {
		return nil, err
	}

	if result.HasErrors() {
		return nil, fmt.Errorf("unexpected graphql errors: %v", result.Errors)
	}

	quotas, err := l.Apps.GetManyProjectQuota(ids)
	if err != nil {
		return nil, err
	}

	ownerCounts, err := l.Collaborators.GetManyProjectOwnerCount(ids)
	if err != nil {
		return nil, err
	}

	var userModels []interface{}

	data := result.Data.(map[string]interface{})
	nodes := data["nodes"].([]interface{})
	for idx, iface := range nodes {
		// It could be null.
		userNode, ok := iface.(map[string]interface{})
		if !ok {
			userModels = append(userModels, nil)
		} else {
			userModel := &model.User{}
			globalID := userNode["id"].(string)
			resolvedNodeID := relay.FromGlobalID(globalID)

			userModel.ID = resolvedNodeID.ID

			standardAttributes := userNode["standardAttributes"].(map[string]interface{})
			email, ok := standardAttributes["email"].(string)
			if ok {
				userModel.Email = email
			}
			formattedName, ok := userNode["formattedName"].(string)
			if ok {
				userModel.FormattedName = formattedName
			}

			quota := quotas[idx]
			if quota < 0 {
				userModel.ProjectQuota = nil
			} else {
				userModel.ProjectQuota = &quota
			}

			userModel.ProjectOwnerCount = ownerCounts[idx]

			userModels = append(userModels, userModel)
		}
	}

	return userModels, nil
}
