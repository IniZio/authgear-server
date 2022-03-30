package loader

import (
	"github.com/authgear/authgear-server/pkg/api/model"
	"github.com/authgear/authgear-server/pkg/util/graphqlutil"
)

type UserLoaderUserService interface {
	GetMany(ids []string) ([]*model.User, error)
}

type UserLoader struct {
	*graphqlutil.DataLoader `wire:"-"`

	Users UserLoaderUserService
}

func NewUserLoader(users UserLoaderUserService) *UserLoader {
	l := &UserLoader{
		Users: users,
	}
	l.DataLoader = graphqlutil.NewDataLoader(l.LoadFunc)
	return l
}

func (l *UserLoader) LoadFunc(keys []interface{}) ([]interface{}, error) {
	// Prepare IDs.
	ids := make([]string, len(keys))
	for i, key := range keys {
		ids[i] = key.(string)
	}

	// Get entities.
	entities, err := l.Users.GetMany(ids)
	if err != nil {
		return nil, err
	}

	// Create map.
	entityMap := make(map[string]*model.User)
	for _, entity := range entities {
		entityMap[entity.ID] = entity
	}

	// Ensure output is in correct order.
	out := make([]interface{}, len(keys))
	for i, id := range ids {
		entity := entityMap[id]
		if err != nil {
			out[i] = nil
		} else {
			out[i] = entity
		}
	}
	return out, nil
}
