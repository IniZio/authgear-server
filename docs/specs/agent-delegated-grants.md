# Agent Delegated Grants

An orchestrator that runs an AI agent in a sandbox can ask Authgear for a delegated grant: a short-lived, sender-constrained token that lets one sandbox act for one user within a stated scope. A resource server or gateway enforces the grant by asking the [Authorization Decision API](./authorization-pdp.md).

## Table of Contents

- [Glossary](#glossary)
- [Client Configuration](#client-configuration)
- [Grant Exchange](#grant-exchange)
- [Grant Token](#grant-token)
- [Grant Record](#grant-record)
- [Decisions on a Grant](#decisions-on-a-grant)
- [Resource Search](#resource-search)
- [Revoking a Grant](#revoking-a-grant)
- [Future Work](#future-work)

## Glossary

| Term | Meaning |
|---|---|
| Orchestrator | A confidential client that creates sandboxes and requests grants. |
| Sandbox | The environment an agent runs in. Authgear does not verify it; the orchestrator vouches for its ID. |
| Grant | A record binding a user, a sandbox, and `authorization_details`. |
| Grant token | The token that identifies a Grant to the gateway. |
| Gateway | The PEP that verifies a Grant token and asks the PDP. It is an `m2m` client associated with the Resource named by `resource`. |

## Client Configuration

```yaml
oauth:
  clients:
  - client_id: agent-orchestrator
    x_application_type: confidential
    x_agent_grant_exchange_enabled: true
```

| Key | Meaning |
|---|---|
| `x_agent_grant_exchange_enabled` | Whether the client may use the [Grant Exchange](#grant-exchange). Defaults to `false` when unset. Takes effect only on `confidential` clients; on any other client type the exchange is rejected regardless of this value. |

## Grant Exchange

`POST /oauth2/token`, a [token exchange](https://datatracker.ietf.org/doc/html/rfc8693) with the client authenticated by `client_secret`. A [DPoP](./dpop.md) proof is required.

| Parameter | Requirement |
|---|---|
| `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange`. |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:id_token`. |
| `subject_token` | An ID token issued by this project to a user. Its session must still be valid. |
| `actor_token_type` | `urn:authgear:params:oauth:token-type:sandbox-id`. |
| `actor_token` | The sandbox ID, an opaque string chosen by the orchestrator. At most 400 characters. |
| `requested_token_type` | `urn:authgear:params:oauth:token-type:agent-grant`. |
| `resource` | Exactly one Resource URI of the project. It becomes the `aud` of the Grant token. |
| `authorization_details` | A JSON array, [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396), with at least one object of the shape below. |

Each `authorization_details` object:

| Field | Requirement |
|---|---|
| `type` | The namespace of the third party, such as `linear`. |
| `actions` | Non-empty array of action names. |
| `teams` | Non-empty array of team identifiers. |

The exchange does not check that the user holds the named teams or actions at the third party; the third party still applies the user's own rights.

Response `200`:

```json
{
  "access_token": "<grant token>",
  "issued_token_type": "urn:authgear:params:oauth:token-type:agent-grant",
  "token_type": "DPoP",
  "expires_in": 900,
  "authorization_details": [
    { "type": "linear", "actions": ["issue:read"], "teams": ["ENG"] }
  ]
}
```

Errors use the standard OAuth error response:

| Error | When |
|---|---|
| `invalid_client` | Wrong or missing `client_secret`. |
| `unauthorized_client` | The client is not `confidential`, or `x_agent_grant_exchange_enabled` is not `true`. |
| `invalid_request` | A parameter above is missing, malformed, or of another type. |
| `invalid_grant` | `subject_token` is invalid, expired, or its session has ended. |
| `invalid_dpop_proof` | No DPoP proof, or an invalid one. Required even when the client sets `x_dpop_disabled`. |
| `invalid_target` | `resource` is not a Resource of the project. |

## Grant Token

A JWT with `typ` `at+jwt`, signed with the project key, bound to the DPoP key of the exchange.

| Claim | Value |
|---|---|
| `iss` | The project endpoint. |
| `aud` | The `resource` of the exchange. |
| `sub` | The user ID of `subject_token`. |
| `act` | `{ "sub": "<sandbox ID>" }`. One level only. |
| `grant_id` | The ID of the [Grant Record](#grant-record). |
| `authorization_details` | As requested. |
| `cnf` | `{ "jkt": "<RFC 7638 thumbprint of the DPoP key>" }`. |
| `client_id` | The orchestrator. |
| `iat`, `exp`, `jti` | `exp` is at most 15 minutes after `iat`. |

The token is usable only with a DPoP proof from the bound key (`Authorization: DPoP`); the gateway verifies the proof, including `cnf.jkt`, as defined by [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449). Authgear does not refresh a Grant token; the orchestrator requests a new Grant.

## Grant Record

Authgear stores one record per successful exchange: ID, user, ID-token session, orchestrator client, sandbox ID, audience, `authorization_details`, DPoP key thumbprint, creation and expiry time. It lives until the Grant token's `exp`, then expires. The session is recorded for future cascading revocation; ending the session does not yet revoke the Grant.

## Decisions on a Grant

A request to the [Evaluation Endpoint](./authorization-pdp.md#evaluation-endpoint) is a Grant request when `resource.type` is not `authgear:resource` and `context.grant_id` is set. `resource.type` is `<namespace>:<kind>`, such as `linear:issue`. Other non-`authgear:` types without `context.grant_id` are still rejected with `400`.

`context`:

| Field | Requirement |
|---|---|
| `grant_id` | The `grant_id` claim of the Grant token. |
| `actor` | Optional. The `act.sub` claim. |

`decision` is `true` only when all of these hold:

1. The Grant exists and has not expired or been revoked.
2. The Grant's user equals `subject.id`, exists, and is not disabled (as in [Decision Rules](./authorization-pdp.md#decision-rules)).
3. `context.actor`, if present, equals the Grant's sandbox ID.
4. An `authorization_details` object has `type` equal to the namespace of `resource.type`, `actions` containing `action.name`, and `teams` containing the team of the request.

The team of the request is `resource.id` when the kind is `team`, otherwise `resource.properties.team`. A request without a team is `false`.

Otherwise `decision` is `false`; an unknown, expired, or revoked Grant is `false`, not an error.

Caller authentication is client mode only; self mode is rejected with `403`. The client must have a [Client-Resource Association](./api-resource.md#client-resource-association) with the Grant's audience, else `403`. Batch evaluation applies the same rules per item.

A `true` decision means the Grant permits the action. It does not mean the user may do it at the third party; the gateway enforces both.

## Resource Search

Returns the resources of a kind that a Grant permits an action on, so a gateway can restrict a list or search to them.

`POST /access/v1/search/resource`, as in [AuthZEN](https://openid.net/specs/authorization-api-1_0.html) resource search.

```json
{
  "subject": { "type": "user", "id": "<user ID>" },
  "resource": { "type": "linear:team" },
  "action": { "name": "issue:read" },
  "context": { "grant_id": "<grant ID>", "actor": "<sandbox ID>" }
}
```

Response `200`:

```json
{
  "results": [
    { "type": "linear:team", "id": "ENG" }
  ]
}
```

| Rule | Behavior |
|---|---|
| Scoping | Only requests with `context.grant_id` are answered. Scoping a search by Grant is an Authgear convention; AuthZEN defines no such field. |
| Result | The `teams` of every `authorization_details` object whose `type` is the namespace of `resource.type` and whose `actions` contain `action.name`. |
| Empty result | Unknown, expired, or revoked Grant; disabled user; `subject.id` not the Grant's user; `context.actor` mismatch. Not an error. |
| Paging | None. The whole result is returned. |
| `400` | `resource.id` is set, `resource.type` is `authgear:resource` or has no namespace, or `context.grant_id` is missing. |
| `401`, `403` | As for Grant requests in [Decisions on a Grant](#decisions-on-a-grant). |

[Discovery](./authorization-pdp.md#discovery) gains `search_resource_endpoint` (AuthZEN 1.0 §9.1.1), for example `https://myapp.authgear.cloud/access/v1/search/resource`. This is the only AuthZEN search implemented; subject and action search remain in [Future Work](./authorization-pdp.md#future-work).

## Revoking a Grant

`DELETE /oauth2/agent_grants/{id}`, authenticated as the orchestrator with `client_secret_basic`.

| Status | When |
|---|---|
| `204` | The Grant was revoked. Later decisions and searches on it are `false` or empty. |
| `401` | Missing or invalid client credentials. |
| `404` | No such Grant, or it belongs to another client. Revoking an already revoked or expired Grant is `404`. |

A Grant Token already issued is not invalidated, but every decision on it is `false` after revocation, so a gateway that asks the PDP on each call stops serving it.

## Future Work

- **Session cascade.** Revoking the Grants of a session when it ends.
- **Persistent storage.** Keeping Grant records beyond the lifetime of a single deployment's cache.
- **Sub-delegation.** More than one `act` level.
- **Other PDP features.** Conditions, query plan, subject and action search, and relationships stay in [Authorization Decision API Future Work](./authorization-pdp.md#future-work).
