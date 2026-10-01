# Authorization Decision API

The Authorization Decision API lets a resource server — an API backend or an MCP server — ask Authgear whether a user may perform an action. Authgear acts as the Policy Decision Point (PDP); the caller is the Policy Enforcement Point (PEP) and enforces the answer.

The API implements [OpenID AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0.html), so an AuthZEN-compliant PEP works without Authgear-specific code.

## Table of Contents

- [Glossary](#glossary)
- [Permission Model](#permission-model)
- [Caller Authentication](#caller-authentication)
- [Evaluation Endpoint](#evaluation-endpoint)
- [Batch Evaluation Endpoint](#batch-evaluation-endpoint)
- [Decision Rules](#decision-rules)
- [Consistency](#consistency)
- [Failure Behavior](#failure-behavior)
- [Discovery](#discovery)
- [Use with MCP Servers](#use-with-mcp-servers)
- [Data Model](#data-model)
- [Admin API](#admin-api)
- [Future Work](#future-work)

## Glossary

| Term | Meaning |
|---|---|
| Resource, Scope | As defined in [API Resources and Scopes](./api-resource.md#glossary). |
| Permission | A Scope granted to a Role. A user holds a Permission when one of their [effective roles](./roles-groups.md#the-effective-roles-of-a-user) has it. |
| PDP | Authgear, answering evaluation requests. |
| PEP | The caller that enforces a decision, usually the resource server named by a Resource. |
| Subject, Action, AuthZEN resource | The three parts of an AuthZEN request. "AuthZEN resource" is the request field; "Resource" alone always means an Authgear Resource. |

## Permission Model

A Role may be granted any number of Scopes, from any number of Resources. Granting a Scope to a Role does not change token issuance: the `scope` claim of an access token remains what the client requested and the user consented to (see [Authorization](./api-resource.md#authorization)). Permissions are answered only by this API.

Groups receive Permissions only through their Roles; a Scope cannot be granted to a Group or a User directly.

When a Role, Scope, or Resource is deleted, every grant involving it is removed.

## Caller Authentication

Every request authenticates in exactly one of two modes. A request carrying both credentials, or neither, is rejected with `401`.

| Mode | Credential | Who may call | Subject |
|---|---|---|---|
| Client | HTTP Basic with `client_id` and `client_secret` (`client_secret_basic`) | `m2m` clients | Any user in the project |
| Self | `Authorization: Bearer <access token>` issued by this project to a user | First-party clients, static or dynamic (see [Client categories](./api-resource.md#client-categories)) | Must equal the token's `sub` |

In client mode, the client may only ask about a Resource it has a [Client-Resource Association](./api-resource.md#client-resource-association) with. Which Scopes that association grants is irrelevant here; the association alone authorizes the client to ask about any Action on that Resource. Asking about any other Resource is rejected with `403`.

In self mode, a JWT access token is accepted regardless of its `aud`. A token issued to a third-party client is rejected with `401`: a user's Permissions are not disclosed to a client they did not consent to share them with. A request whose Subject is not the token's `sub` is rejected with `403`. A PEP that verified a user's token on behalf of that user uses client mode, not self mode; self mode exists for clients that ask about their own user, such as a frontend hiding controls the user cannot use.

## Evaluation Endpoint

`POST /access/v1/evaluation`

Request:

```json
{
  "subject": { "type": "user", "id": "<user ID>" },
  "resource": { "type": "authgear:resource", "id": "https://api.myapp.com" },
  "action": { "name": "posts:write" },
  "context": {}
}
```

| Field | Requirement |
|---|---|
| `subject.type` | Must be `user`. |
| `subject.id` | The user ID, as in the `sub` claim. |
| `resource.type` | Must be `authgear:resource`. The `authgear:` prefix is reserved for Authgear-defined types. |
| `resource.id` | A Resource URI. |
| `action.name` | A Scope of that Resource. |
| `context` | Optional. Accepted and ignored. |
| `properties` on `subject`, `resource`, `action` | Optional. Accepted and ignored. |

Any other `subject.type` or `resource.type` is rejected with `400`, not answered with `false`, so a PEP never mistakes an unsupported request for a denial.

Response `200`:

```json
{
  "decision": true
}
```

The success body is the bare AuthZEN response, not wrapped in `result`, because AuthZEN PEPs expect that shape. The response carries the request's `X-Request-ID` header back unchanged, when present, as AuthZEN requires.

Errors use the standard [error envelope](./api.md):

| Status | When |
|---|---|
| `400` | Malformed body, unsupported `subject.type` or `resource.type`. |
| `401` | Missing, invalid, or doubled credentials. |
| `403` | Client mode: no association with the Resource. Self mode: Subject is not the token's `sub`. |
| `5xx` | The PDP could not reach a decision. See [Failure Behavior](#failure-behavior). |

## Batch Evaluation Endpoint

`POST /access/v1/evaluations`

Evaluates up to 100 requests in one call, as defined by AuthZEN. Top-level `subject`, `resource`, `action`, and `context` are defaults that each item in `evaluations` may override.

```json
{
  "subject": { "type": "user", "id": "<user ID>" },
  "resource": { "type": "authgear:resource", "id": "https://api.myapp.com" },
  "evaluations": [
    { "action": { "name": "posts:read" } },
    { "action": { "name": "posts:write" } }
  ],
  "options": { "evaluations_semantic": "execute_all" }
}
```

`options.evaluations_semantic`:

| Value | Behavior |
|---|---|
| `execute_all` (default) | Every item is evaluated; one decision per item, in order. |
| `deny_on_first_deny` | Stops at the first `false`; the response holds the decisions up to and including it. |
| `permit_on_first_permit` | Stops at the first `true`; the response holds the decisions up to and including it. |

Response `200`:

```json
{
  "evaluations": [
    { "decision": true },
    { "decision": false }
  ]
}
```

Every item is checked against [Caller Authentication](#caller-authentication) before any is evaluated; one item that fails it rejects the whole request with that item's status. More than 100 items is `400`.

## Decision Rules

`decision` is `true` only when all of these hold:

1. The user exists, is not anonymized, and `is_disabled` is `false` (see [Account Status](./user-model.md#account-status); this covers deactivated, scheduled for deletion or anonymization, and outside the account validity period).
2. `resource.id` is a Resource of the project.
3. `action.name` is a Scope of that Resource.
4. At least one effective role of the user has been granted that Scope.

Otherwise `decision` is `false`. An unknown user, Resource, or Scope is `false`, not an error, so the response does not reveal which part is unknown.

A decision describes the user. It does not consider which client the user is using or which scopes their access token carries; see [Use with MCP Servers](#use-with-mcp-servers).

## Consistency

A change that affects a decision is reflected in every evaluation that starts after the change is committed. This covers:

- granting or removing a Scope on a Role;
- adding or removing a Role or Group on a User, or a Role on a Group;
- deleting a Role, Group, Resource, or Scope;
- disabling, re-enabling, deactivating, or deleting a User;
- adding or removing a Client-Resource Association (affects client-mode access to the endpoint).

A cached decision must never outlive such a change. Staleness is possible only where a PEP keeps its own copy, such as the `https://authgear.com/claims/user/roles` claim of an access token, which is fixed until the token expires.

## Failure Behavior

The PDP never answers `true` when it cannot complete the [Decision Rules](#decision-rules). Any internal failure, including a dependency timeout, is a `5xx` error, never a `200`.

A PEP must treat any non-`200` response, and any network failure, as a denial.

Evaluations do not generate events and are not written to the [audit log](./audit-log.md).

## Discovery

`GET /.well-known/authzen-configuration` returns the PDP metadata defined by AuthZEN:

```json
{
  "policy_decision_point": "https://myapp.authgear.cloud",
  "access_evaluation_endpoint": "https://myapp.authgear.cloud/access/v1/evaluation",
  "access_evaluations_endpoint": "https://myapp.authgear.cloud/access/v1/evaluations"
}
```

`policy_decision_point` is the project endpoint, identical to the OIDC `issuer`. Search endpoints are omitted until they exist.

## Use with MCP Servers

An MCP server is registered as a Resource, and each tool is guarded by one of its Scopes. A tool call is allowed only when both hold:

- the access token's `scope` contains the Scope, meaning the user consented to the MCP client using it; and
- the PDP answers `true` for the user and that Scope, meaning the user holds the Permission.

The MCP server, as an `m2m` client associated with its own Resource, asks in client mode. It may use the batch endpoint to drop tools from `tools/list` that the user cannot call.

## Data Model

```sql
CREATE TABLE _auth_role_resource_scope (
  id text PRIMARY KEY,
  app_id text NOT NULL,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone NOT NULL,
  role_id text NOT NULL REFERENCES _auth_role(id),
  scope_id text NOT NULL REFERENCES _auth_resource_scope(id)
);
-- A Scope can be granted to a Role at most once.
CREATE UNIQUE INDEX _auth_role_resource_scope_unique ON _auth_role_resource_scope USING btree (app_id, role_id, scope_id);
CREATE INDEX _auth_role_resource_scope_scope ON _auth_role_resource_scope USING btree (app_id, scope_id);
```

## Admin API

Granting and removing Permissions does not generate events, consistent with [CRUD of Roles and Groups](./roles-groups.md#crud-of-roles-and-groups).

```graphql
type Mutation {
  addScopesToRole(input: AddScopesToRoleInput!): AddScopesToRolePayload!
  removeScopesFromRole(input: RemoveScopesFromRoleInput!): RemoveScopesFromRolePayload!
}

extend type Role {
  """Scopes granted to this Role. If resourceURI is set, only that Resource's Scopes."""
  scopes(resourceURI: String, after: String, before: String, first: Int, last: Int): ScopeConnection
}

extend type Scope {
  """Roles granted this Scope."""
  roles(after: String, before: String, first: Int, last: Int): RoleConnection
}

input AddScopesToRoleInput {
  roleKey: String!
  resourceURI: String!
  scopes: [String!]!
}

type AddScopesToRolePayload {
  role: Role!
}

input RemoveScopesFromRoleInput {
  roleKey: String!
  resourceURI: String!
  scopes: [String!]!
}

type RemoveScopesFromRolePayload {
  role: Role!
}
```

`addScopesToRole` fails if the Role, the Resource, or any listed Scope does not exist. Adding a Scope the Role already has is not an error.

## Future Work

Each item below is a separate spec when picked up.

- **Conditions.** CEL expressions on a Permission over the Subject's attributes, the AuthZEN resource's `properties`, and `context`. This gives `context` and `properties` an effect.
- **Query plan.** An endpoint returning the condition under which an Action is allowed, for a PEP to turn into a database filter ("list all posts the user can see").
- **Search.** AuthZEN subject, resource, and action search endpoints.
- **MCP tool registration.** Declaring an MCP server's tools and their Scopes, so `insufficient_scope` challenges and `tools/list` filtering need no PEP-side mapping.
- **Hook-derived data.** Hooks that compute user attributes when data changes, so conditions read stored values instead of calling a hook per evaluation.
- **Check-time hook.** An opt-in blocking hook consulted during evaluation, with a decision cache and deny on timeout.
- **Relationships.** Per-object relationships ("user owns post 123"), or delegation to an external relationship engine.
- **Decision log.** Recording or streaming decisions for audit.
- **Rate limits.** Dedicated buckets for both endpoints in the [rate limit](./rate-limit.md) configuration.
