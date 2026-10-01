// Seeds Authgear (via the Admin API) with everything the Acme Docs demo needs.
// Safe to re-run: existing objects are looked up first; association mutations are idempotent.
import { createPrivateKey } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { SignJWT } from "jose";
import { config, env } from "../src/config.ts";
import { allScopes } from "../src/tools.ts";

const adminUrl = new URL(env("ADMIN_API_ENDPOINT", "http://localhost:3002/graphql"));
// The Admin API server resolves the project from the Host header.
const adminHost = env("ADMIN_API_HOST", new URL(config.authgearEndpoint).host);
const pdpClientId = env("PDP_CLIENT_ID", "acme-docs-pdp");
const DEMO_PASSWORD = "Demo1234!";

const PEM = env("ADMIN_API_PRIVATE_KEY_PEM").replace(/\\n/g, "\n");
const KEY_ID = env("ADMIN_API_KEY_ID");

const scopeDescriptions: Record<string, string> = {
  "docs:read": "Search and read documents",
  "docs:write": "Create and edit documents",
  "docs:delete": "Delete documents",
  "docs:publish": "Publish documents",
};

const roles = [
  { key: "docs_admin", name: "Docs Admin", scopes: ["docs:read", "docs:write", "docs:delete", "docs:publish"] },
  { key: "docs_editor", name: "Docs Editor", scopes: ["docs:read", "docs:write"] },
  { key: "docs_viewer", name: "Docs Viewer", scopes: ["docs:read"] },
];

const users = [
  { username: "alice", roles: ["docs_admin"], groups: [] as string[] },
  { username: "bob", roles: [] as string[], groups: ["writers"] },
  { username: "carol", roles: ["docs_viewer"], groups: [] as string[] },
];

const groups = [{ key: "writers", name: "Writers", roles: ["docs_editor"] }];

// Let first-party static clients and first-party DCR/CIMD clients (e.g. Claude Code) request the scopes.
const accessPolicy = { allowStaticFirstPartyClientAccess: true, allowDynamicFirstPartyClientAccess: true };

async function mintAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: KEY_ID })
    .setAudience(config.appId)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(createPrivateKey(PEM));
}

// fetch cannot override Host, which the Admin API needs for project resolution.
function post(body: string, token: string): Promise<{ status: number; text: string }> {
  const transport = adminUrl.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      adminUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, host: adminHost },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString() }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

let token: string | undefined;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  token ??= await mintAdminToken();
  const { status, text } = await post(JSON.stringify({ query, variables }), token);
  if (status !== 200) throw new Error(`Admin API responded ${status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data as T;
}

type Conn<T> = { edges: { node: T }[] } | null;
const nodes = <T>(c: Conn<T>) => c?.edges.map((e) => e.node) ?? [];

const log = (verb: string, what: string) => console.log(`  ${verb.padEnd(8)} ${what}`);

async function ensureResource(): Promise<void> {
  const data = await gql<{
    resources: Conn<{ resourceURI: string; scopes: Conn<{ scope: string }> }>;
  }>(
    `query($q: String) { resources(first: 50, searchKeyword: $q) { edges { node { resourceURI scopes(first: 100) { edges { node { scope } } } } } } }`,
    { q: config.resourceUri },
  );
  const existing = nodes(data.resources).find((r) => r.resourceURI === config.resourceUri);

  if (existing) {
    await gql(`mutation($i: UpdateResourceInput!) { updateResource(input: $i) { resource { id } } }`, {
      i: { resourceURI: config.resourceUri, accessPolicy },
    });
    log("ok", `resource ${config.resourceUri}`);
  } else {
    await gql(`mutation($i: CreateResourceInput!) { createResource(input: $i) { resource { id } } }`, {
      i: { resourceURI: config.resourceUri, name: "Acme Docs", accessPolicy },
    });
    log("created", `resource ${config.resourceUri}`);
  }

  const have = new Set(nodes(existing?.scopes ?? null).map((s) => s.scope));
  for (const scope of allScopes) {
    if (have.has(scope)) {
      await gql(`mutation($i: UpdateScopeInput!) { updateScope(input: $i) { scope { id } } }`, {
        i: { resourceURI: config.resourceUri, scope, accessPolicy },
      });
      log("ok", `scope ${scope}`);
    } else {
      await gql(`mutation($i: CreateScopeInput!) { createScope(input: $i) { scope { id } } }`, {
        i: { resourceURI: config.resourceUri, scope, description: scopeDescriptions[scope], accessPolicy },
      });
      log("created", `scope ${scope}`);
    }
  }

  await gql(`mutation($i: AddResourceToClientIDInput!) { addResourceToClientID(input: $i) { resource { id } } }`, {
    i: { resourceURI: config.resourceUri, clientID: pdpClientId },
  });
  log("ok", `m2m client ${pdpClientId} associated with resource`);
}

async function ensureRoles(): Promise<void> {
  const data = await gql<{ roles: Conn<{ key: string }> }>(`{ roles(first: 100) { edges { node { key } } } }`);
  const have = new Set(nodes(data.roles).map((r) => r.key));
  for (const role of roles) {
    if (!have.has(role.key)) {
      await gql(`mutation($i: CreateRoleInput!) { createRole(input: $i) { role { id } } }`, {
        i: { key: role.key, name: role.name },
      });
      log("created", `role ${role.key}`);
    } else {
      log("ok", `role ${role.key}`);
    }
    await gql(`mutation($i: AddScopesToRoleInput!) { addScopesToRole(input: $i) { role { id } } }`, {
      i: { roleKey: role.key, resourceURI: config.resourceUri, scopes: role.scopes },
    });
    log("ok", `  ${role.key} <- ${role.scopes.join(", ")}`);
  }
}

async function ensureGroups(): Promise<void> {
  const data = await gql<{ groups: Conn<{ key: string }> }>(`{ groups(first: 100) { edges { node { key } } } }`);
  const have = new Set(nodes(data.groups).map((g) => g.key));
  for (const group of groups) {
    if (!have.has(group.key)) {
      await gql(`mutation($i: CreateGroupInput!) { createGroup(input: $i) { group { id } } }`, {
        i: { key: group.key, name: group.name },
      });
      log("created", `group ${group.key}`);
    } else {
      log("ok", `group ${group.key}`);
    }
    for (const roleKey of group.roles) {
      await gql(`mutation($i: AddRoleToGroupsInput!) { addRoleToGroups(input: $i) { role { id } } }`, {
        i: { roleKey, groupKeys: [group.key] },
      });
    }
  }
}

async function ensureUsers(): Promise<void> {
  for (const u of users) {
    const found = await gql<{ getUserByLoginID: { id: string } | null }>(
      `query($v: String!) { getUserByLoginID(loginIDKey: "username", loginIDValue: $v) { id } }`,
      { v: u.username },
    );
    let id = found.getUserByLoginID?.id;
    if (id) {
      log("ok", `user ${u.username}`);
    } else {
      const created = await gql<{ createUser: { user: { id: string } } }>(
        `mutation($i: CreateUserInput!) { createUser(input: $i) { user { id } } }`,
        { i: { definition: { loginID: { key: "username", value: u.username } }, password: DEMO_PASSWORD } },
      );
      id = created.createUser.user.id;
      log("created", `user ${u.username} (password ${DEMO_PASSWORD})`);
    }
    if (u.roles.length) {
      await gql(`mutation($i: AddUserToRolesInput!) { addUserToRoles(input: $i) { user { id } } }`, {
        i: { userID: id, roleKeys: u.roles },
      });
    }
    if (u.groups.length) {
      await gql(`mutation($i: AddUserToGroupsInput!) { addUserToGroups(input: $i) { user { id } } }`, {
        i: { userID: id, groupKeys: u.groups },
      });
    }
  }
}

try {
  console.log(`Seeding ${adminUrl.href} (project host ${adminHost}, app ${config.appId})`);
  await ensureResource();
  await ensureRoles();
  await ensureGroups();
  await ensureUsers();
  console.log("\nDone. Try: npm run demo -- --all");
} catch (err) {
  console.error(`\nSeed failed: ${(err as Error).message}`);
  process.exitCode = 1;
}
