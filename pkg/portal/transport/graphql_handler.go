package transport

import (
	"context"
	"errors"
	"net/http"

	gographql "github.com/graphql-go/graphql"
	graphqlgohandler "github.com/graphql-go/handler"

	"github.com/authgear/authgear-server/pkg/lib/config"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/auditdb"
	"github.com/authgear/authgear-server/pkg/lib/infra/db/globaldb"
	"github.com/authgear/authgear-server/pkg/portal/graphql"
	"github.com/authgear/authgear-server/pkg/util/graphqlutil"
	"github.com/authgear/authgear-server/pkg/util/httproute"
)

func ConfigureGraphQLRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("GET", "POST").
		WithPathPattern("/api/graphql")
}

type GraphQLHandler struct {
	DevMode        config.DevMode
	GraphQLContext *graphql.Context
	Database       *globaldb.Handle
	AuditDatabase  *auditdb.ReadHandle
}

func (h *GraphQLHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		graphiql := &graphqlutil.GraphiQL{
			Title: "GraphiQL: Portal - Authgear",
		}
		graphiql.ServeHTTP(w, r)
		return
	} else {
		// graphql-go/handler will use "query=" when it is present.
		// This causes GraphiQL unable to fetch the schema.
		q := r.URL.Query()
		q.Del("query")
		r.URL.RawQuery = q.Encode()
	}

	invoke := func(f func() error) error {
		return f()
	}
	if h.AuditDatabase != nil {
		invoke = h.AuditDatabase.ReadOnly
	}

	err := invoke(func() error {
		return h.Database.WithTx(func() error {
			doRollback := false
			graphqlHandler := graphqlgohandler.New(&graphqlgohandler.Config{
				Schema:   graphql.Schema,
				Pretty:   false,
				GraphiQL: false,
				ResultCallbackFn: func(ctx context.Context, params *gographql.Params, result *gographql.Result, responseBody []byte) {
					if result.HasErrors() {
						doRollback = true
					}
				},
			})

			ctx := graphql.WithContext(r.Context(), h.GraphQLContext)
			graphqlHandler.ContextHandler(ctx, w, r)

			if doRollback {
				return errRollback
			}
			return nil
		})
	})
	if err != nil && !errors.Is(err, errRollback) {
		panic(err)
	}
}
