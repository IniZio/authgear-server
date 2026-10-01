package graphql

import (
	"context"

	"github.com/graphql-go/graphql"

	"github.com/authgear/authgear-server/pkg/api/apierrors"
	"github.com/authgear/authgear-server/pkg/api/model"
	relay "github.com/authgear/authgear-server/pkg/graphqlgo/relay"
	"github.com/authgear/authgear-server/pkg/util/graphqlutil"
)

const typeScope = "Scope"

var ErrInvalidScopeID = apierrors.NewInvalid("invalid scope ID")

func init() {
	// Scope and role form an initialization cycle, so use AddFieldConfig.
	nodeScope.AddFieldConfig("roles", &graphql.Field{
		Type:        connRole.ConnectionType,
		Description: "The list of roles that grant this scope.",
		Args:        relay.NewConnectionArgs(graphql.FieldConfigArgument{}),
		Resolve: func(p graphql.ResolveParams) (any, error) {
			source := p.Source.(*model.Scope)
			ctx := p.Context
			gqlCtx := GQLContext(ctx)

			roles, err := gqlCtx.RolesGroupsFacade.ListRolesByScopeID(ctx, source.ID)
			if err != nil {
				return nil, err
			}

			roleIfaces := make([]any, len(roles))
			for i, r := range roles {
				roleIfaces[i] = r
			}

			args := relay.NewConnectionArguments(p.Args)
			return graphqlutil.NewConnectionFromArray(roleIfaces, args), nil
		},
	})
}

var nodeScope = node(
	graphql.NewObject(graphql.ObjectConfig{
		Name:        typeScope,
		Description: "Authgear scope",
		Interfaces: []*graphql.Interface{
			nodeDefs.NodeInterface,
			entityInterface,
		},
		Fields: graphql.Fields{
			"id":        entityIDField(typeScope),
			"createdAt": entityCreatedAtField(nil),
			"updatedAt": entityUpdatedAtField(nil),
			"resourceID": &graphql.Field{
				Type: graphql.NewNonNull(graphql.ID),
				Resolve: func(p graphql.ResolveParams) (any, error) {
					source := p.Source.(*model.Scope)
					return relay.ToGlobalID(typeResource, source.ResourceID), nil
				},
				Description: "The resource ID.",
			},
			"scope": &graphql.Field{
				Type:        graphql.NewNonNull(graphql.String),
				Description: "The scope string.",
			},
			"description": &graphql.Field{
				Type:        graphql.String,
				Description: "The optional description of the scope.",
			},
			"accessPolicy": &graphql.Field{
				Type:        graphql.NewNonNull(accessPolicyType),
				Description: "The access policy controlling which categories of client may access this scope without a per-client association.",
			},
		},
	}),
	&model.Scope{},
	func(ctx context.Context, gqlCtx *Context, id string) (any, error) {
		return gqlCtx.Scopes.Load(ctx, id).Value, nil
	},
)

var connScope = graphqlutil.NewConnectionDef(nodeScope)
