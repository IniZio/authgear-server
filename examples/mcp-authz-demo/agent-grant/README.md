# Agent sandbox demo: delegated grants enforced by a gateway

Shows an AI agent that acts for a user with a narrow, revocable grant. An orchestrator signs in alice, exchanges her ID token for a DPoP-bound grant token, and hands it to an agent in a network-isolated sandbox. The agent can reach only a gateway. The gateway asks the [Authorization Decision API](../../../docs/specs/authorization-pdp.md) on every call. The upstream is a fake Linear MCP server.

The behavior is defined in the [Agent Delegated Grants spec](../../../docs/specs/agent-delegated-grants.md). This demo is example code; do not use it as a production design.

## What it shows

```
 host
 +-------------------------------------------------------------+
 | orchestrator (npm run agent-demo)                           |
 |   sign in alice -> token exchange (DPoP) -> grant token     |
 |   ... docker compose run agent ... -> revoke grant          |
 +--------------------------+----------------------------------+
                            | GRANT_TOKEN, DPOP_PRIVATE_JWK
 +--------------------------v-------+ sandbox (internal) +------------------+
 | agent                            |------------------->| gateway  :4200   |
 | no route to Linear, Authgear,    |                    | - DPoP check     |
 | or the internet                  |                    | - PDP per call   |
 +----------------------------------+                    | - list rewrite   |
                                                         |   (Resource      |
                                                         |   Search)        |
                                                         | - response filter|
                                                         | - not-found      |
                                                         +----+--------+----+
                                         upstream (internal)  |        | egress
                                                  +-----------v--+  +--v---------+
                                                  | fake Linear  |  | Authgear   |
                                                  | :4300        |  | PDP + JWKS |
                                                  +--------------+  +------------+
```

- The `sandbox` and `upstream` networks are `internal`. Only the gateway is also on `egress`.
- The gateway checks the DPoP proof and the token, then asks Authgear for a decision per call. For `list_*` and search tools it asks Resource Search for the teams the grant allows and rewrites the arguments. It filters responses, and returns "not found" for items outside the grant.
- The orchestrator holds the client secret. The agent holds only the grant token and the DPoP private key.

Fake Linear has teams ENG, OPS and FIN. Alice is a member of ENG and OPS only. Grant A allows ENG. Grant B allows ENG and FIN, which is more than alice has in Linear.

## Prerequisites

On top of the [existing setup](../README.md#walkthrough):

- Docker with Compose. The Authgear `docker compose up -d` must include the nginx `proxy` service on port `3100`. The gateway container reaches Authgear through it.
- `npm install && npm run setup` in `examples/mcp-authz-demo`. This also creates the `agent-orchestrator` client (confidential, with `x_agent_grant_exchange_enabled`) and the `linear-gateway-pdp` `m2m` client, and writes their secrets to `.env`.
- Restart Authgear (`make start`) so it loads the new clients.
- `npm run seed`. This creates the gateway Resource `https://linear-gateway.localhost` and associates the gateway client with it.

The orchestrator needs no running `npm start`; it starts the sandbox itself.

## Run

```sh
cd examples/mcp-authz-demo
npm run agent-demo
```

A browser opens for alice to sign in (password `Demo1234!`). On a headless machine add `-- --no-browser` and open the printed URL.

The orchestrator then runs three agent phases, revoking and tearing down the sandbox at the end. It exits `0` only if every check passes. On failure it still revokes open grants and removes the containers and networks.

### Phase: granted

Grant A (ENG). Checks that the agent gets ENG data only, that the gateway rejects replays, and that the sandbox has no other route out.

```
=== grant A: ENG only ===
teams ENG:
  token_type            DPoP
  sub                   2025a69d-7b4a-4592-a64b-72824f474588
  act                   {"sub":"sandbox-a00b18cd"}
  grant_id              71298e3d-95bf-45d7-b054-94704ac5ca25
  authorization_details [{"type":"linear","teams":["ENG"],"actions":["team:read","issue:read","issue:write","comment:read","comment:create"]}]
  cnf.jkt               P3NRZ_Zjddk25HhkppmGf4VLI778smau2pINutXUMz0
  exp                   1790836906 (2026-10-01T06:41:46.000Z)

phase: granted
RESULT  ROW                               EXPECTED               ACTUAL
PASS    tools/list has no delete_comment  delete_comment absent  [list_teams,list_issues,search_issues,get_issue,save_issue,…
PASS    list_issues ENG only              all team=ENG, n>0      3 items, teams [ENG]
PASS    search_issues "outage"            [ENG-1]                [ENG-1]
PASS    get_issue ENG-2 hides OPS-1       relations empty        []
PASS    get_issue OPS-1                   Issue OPS-1 not found  Issue OPS-1 not found
PASS    save_comment on ENG-1             ok                     ok
PASS    delete_comment C-1                denied/not found       Comment C-1 not found
PASS    replay with Bearer scheme         401                    401
PASS    replay without DPoP proof         401                    401
PASS    egress example.com                fetch fails            blocked (TimeoutError)
PASS    egress linear:4300                fetch fails            blocked (TimeoutError)
PASS    no FIN/OPS data in results        none                   none
ALL 12 PASS
```

### Phase: revoked

The orchestrator calls `DELETE /oauth2/agent_grants/{grant_id}` and the agent repeats calls with the same token. The PDP now answers false and Resource Search returns nothing.

```
=== revoke grant A ===
DELETE /oauth2/agent_grants/71298e3d-95bf-45d7-b054-94704ac5ca25 -> 204

phase: revoked
RESULT  ROW                                                        EXPECTED                ACTUAL
PASS    tools/list empty                                           []                      []
PASS    list_issues {}                                             denied/not found/empty  []
PASS    get_issue {"id":"ENG-1"}                                   denied/not found/empty  Issue ENG-1 not found
PASS    save_comment {"issueId":"ENG-1","body":"should not land"}  denied/not found/empty  Issue ENG-1 not found
ALL 9 PASS
```

(Rows abridged here; the run prints nine.)

### Phase: over-grant

Grant B allows `ENG` and `FIN`. The PDP allows FIN because the grant says so, but alice is not a member of FIN in Linear, so Linear returns nothing for it. The grant narrows access; it does not widen what the user can do upstream.

```
=== grant B: ENG + FIN (FIN is not Alice's team in Linear) ===
phase: over-grant
RESULT  ROW                         EXPECTED               ACTUAL
PASS    list_issues ENG only        all team=ENG, n>0      3 items, teams [ENG]
PASS    get_issue FIN-1             Issue FIN-1 not found  Issue FIN-1 not found
PASS    list_teams ENG only         [ENG]                  [ENG]
PASS    no FIN/OPS data in results  none                   none
ALL 4 PASS

agent-demo: ALL PHASES PASSED
```

## Decision Console

While the sandbox runs, open <http://127.0.0.1:4200/console> to see the gateway's PDP decisions. The orchestrator stops the gateway at the end of the run, so open the page before the run finishes or re-run. The console is unauthenticated and demo-only.

## How it maps to the spec

| Demo step | Spec section |
|---|---|
| `agent-orchestrator` client flag | [Client Configuration](../../../docs/specs/agent-delegated-grants.md#client-configuration) |
| Token exchange with a sandbox ID and `authorization_details` | [Grant Exchange](../../../docs/specs/agent-delegated-grants.md#grant-exchange) |
| `sub`, `act`, `grant_id`, `cnf.jkt` claims | [Grant Token](../../../docs/specs/agent-delegated-grants.md#grant-token) |
| Gateway PDP call per request | [Decisions on a Grant](../../../docs/specs/agent-delegated-grants.md#decisions-on-a-grant) |
| List rewriting | [Resource Search](../../../docs/specs/agent-delegated-grants.md#resource-search) |
| Revoked phase | [Revoking a Grant](../../../docs/specs/agent-delegated-grants.md#revoking-a-grant) |

## Known gaps

- No `sid` or logout cascade. The grant stores the user's `sid` but logging out does not revoke the grant. Only `DELETE /oauth2/agent_grants/{id}` or expiry ends it.
- The gateway resolves an item's team (for example `ENG-1`) before it asks the PDP. The item can change between the lookup and the call (TOCTOU).
- The DPoP private key and the grant token are visible inside the Docker guest. The proof binding stops use from another sender, not theft from inside the sandbox. Only an egress proxy that injects the secret (for example nexus) would keep them out of the guest.
- Resource Search is not paged.
- Grants are stored in Redis only.
- Create actions are evaluated with the placeholder resource id `new`. This is a gateway-side workaround; there is no id before the item exists.
- The gateway reaches Authgear as `localhost` through `host-gateway` (port `3100`), because Authgear redirects any other `Host` value.

## Files

| File | Purpose |
|---|---|
| `orchestrator.ts` | Sign-in, token exchange, sandbox lifecycle, revoke, phases. |
| `docker-compose.yml` | Networks `sandbox`, `upstream`, `egress`; services `agent`, `gateway`, `linear`. |
| `agent/agent.ts` | Scripted agent that runs the checks for each phase. |
| `gateway/` | DPoP and token verification, PDP mapping, list rewrite, response filter. |
| `linear/` | Fake Linear MCP server with in-memory data. |
| `shared/dpop.ts` | DPoP proof creation and verification. |
