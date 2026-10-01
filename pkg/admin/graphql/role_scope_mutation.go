package graphql

import (
	"github.com/graphql-go/graphql"

	"github.com/authgear/authgear-server/pkg/lib/rolesgroups"
	"github.com/authgear/authgear-server/pkg/util/graphqlutil"
)

var addScopesToRoleInput = graphql.NewInputObject(graphql.InputObjectConfig{
	Name: "AddScopesToRoleInput",
	Fields: graphql.InputObjectConfigFieldMap{
		"roleKey": &graphql.InputObjectFieldConfig{
			Type:        graphql.NewNonNull(graphql.String),
			Description: "The key of the role.",
		},
		"resourceURI": &graphql.InputObjectFieldConfig{
			Type:        graphql.NewNonNull(graphql.String),
			Description: "The URI of the resource the scopes belong to.",
		},
		"scopes": &graphql.InputObjectFieldConfig{
			Type:        graphql.NewNonNull(graphql.NewList(graphql.NewNonNull(graphql.String))),
			Description: "The list of scopes.",
		},
	},
})

var addScopesToRolePayload = graphql.NewObject(graphql.ObjectConfig{
	Name: "AddScopesToRolePayload",
	Fields: graphql.Fields{
		"role": &graphql.Field{
			Type: graphql.NewNonNull(nodeRole),
		},
	},
})

var _ = registerMutationField(
	"addScopesToRole",
	&graphql.Field{
		Description: "Add scopes of a resource to the role.",
		Type:        graphql.NewNonNull(addScopesToRolePayload),
		Args: graphql.FieldConfigArgument{
			"input": &graphql.ArgumentConfig{
				Type: graphql.NewNonNull(addScopesToRoleInput),
			},
		},
		Resolve: func(p graphql.ResolveParams) (any, error) {
			input := p.Args["input"].(map[string]any)

			scopeIfaces := input["scopes"].([]any)
			scopes := make([]string, len(scopeIfaces))
			for i, v := range scopeIfaces {
				scopes[i] = v.(string)
			}

			options := &rolesgroups.AddScopesToRoleOptions{
				RoleKey:     input["roleKey"].(string),
				ResourceURI: input["resourceURI"].(string),
				Scopes:      scopes,
			}

			ctx := p.Context
			gqlCtx := GQLContext(ctx)

			roleID, err := gqlCtx.RolesGroupsFacade.AddScopesToRole(ctx, options)
			if err != nil {
				return nil, err
			}

			return graphqlutil.NewLazyValue(map[string]any{
				"role": gqlCtx.Roles.Load(ctx, roleID),
			}).Value, nil
		},
	},
)

var removeScopesFromRoleInput = graphql.NewInputObject(graphql.InputObjectConfig{
	Name: "RemoveScopesFromRoleInput",
	Fields: graphql.InputObjectConfigFieldMap{
		"roleKey": &graphql.InputObjectFieldConfig{
			Type:        graphql.NewNonNull(graphql.String),
			Description: "The key of the role.",
		},
		"resourceURI": &graphql.InputObjectFieldConfig{
			Type:        graphql.NewNonNull(graphql.String),
			Description: "The URI of the resource the scopes belong to.",
		},
		"scopes": &graphql.InputObjectFieldConfig{
			Type:        graphql.NewNonNull(graphql.NewList(graphql.NewNonNull(graphql.String))),
			Description: "The list of scopes.",
		},
	},
})

var removeScopesFromRolePayload = graphql.NewObject(graphql.ObjectConfig{
	Name: "RemoveScopesFromRolePayload",
	Fields: graphql.Fields{
		"role": &graphql.Field{
			Type: graphql.NewNonNull(nodeRole),
		},
	},
})

var _ = registerMutationField(
	"removeScopesFromRole",
	&graphql.Field{
		Description: "Remove scopes of a resource from the role.",
		Type:        graphql.NewNonNull(removeScopesFromRolePayload),
		Args: graphql.FieldConfigArgument{
			"input": &graphql.ArgumentConfig{
				Type: graphql.NewNonNull(removeScopesFromRoleInput),
			},
		},
		Resolve: func(p graphql.ResolveParams) (any, error) {
			input := p.Args["input"].(map[string]any)

			scopeIfaces := input["scopes"].([]any)
			scopes := make([]string, len(scopeIfaces))
			for i, v := range scopeIfaces {
				scopes[i] = v.(string)
			}

			options := &rolesgroups.RemoveScopesFromRoleOptions{
				RoleKey:     input["roleKey"].(string),
				ResourceURI: input["resourceURI"].(string),
				Scopes:      scopes,
			}

			ctx := p.Context
			gqlCtx := GQLContext(ctx)

			roleID, err := gqlCtx.RolesGroupsFacade.RemoveScopesFromRole(ctx, options)
			if err != nil {
				return nil, err
			}

			return graphqlutil.NewLazyValue(map[string]any{
				"role": gqlCtx.Roles.Load(ctx, roleID),
			}).Value, nil
		},
	},
)
