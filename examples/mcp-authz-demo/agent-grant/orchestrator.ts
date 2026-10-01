// Orchestrator: signs in alice, mints agent grants over a DPoP-bound token exchange, runs the sandboxed agent
// against the gateway, revokes the grants, and tears the sandbox down.
//   npm run agent-demo [-- --no-browser]
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeJwt } from "jose";
import { config, env } from "../src/config.ts";
import { login } from "../scripts/login.ts";
import { createProof, generateKeyPair } from "./shared/dpop.ts";

const here = dirname(fileURLToPath(import.meta.url));
const composeFile = resolve(here, "docker-compose.yml");
const orchestratorId = env("ORCHESTRATOR_CLIENT_ID", "agent-orchestrator");
const orchestratorSecret = env("ORCHESTRATOR_CLIENT_SECRET");
const gatewayResource = env("GATEWAY_RESOURCE_URI", "https://linear-gateway.localhost");
const noBrowser = process.argv.includes("--no-browser");

const ENG_ACTIONS = ["team:read", "issue:read", "issue:write", "comment:read", "comment:create"];
const basic = `Basic ${Buffer.from(`${encodeURIComponent(orchestratorId)}:${encodeURIComponent(orchestratorSecret)}`).toString("base64")}`;

const heading = (s: string) => console.log(`\n=== ${s} ===`);

// The gateway container reaches Authgear at the same public origin; compose maps that host to the Docker host.
const composeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GATEWAY_RESOURCE_URI: gatewayResource,
  GATEWAY_AUTHGEAR_ENDPOINT: config.authgearEndpoint,
  GATEWAY_AUTHGEAR_HOST: new URL(config.authgearEndpoint).hostname,
};

function compose(args: string[], extraEnv: Record<string, string> = {}): number {
  const res = spawnSync("docker", ["compose", "-f", composeFile, ...args], {
    stdio: "inherit",
    env: { ...composeEnv, ...extraEnv },
  });
  return res.status ?? 1;
}

async function waitForGateway(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4200/console")).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("gateway did not become ready");
}

const oidc = (await (await fetch(`${config.authgearEndpoint}/.well-known/openid-configuration`)).json()) as {
  issuer: string;
  token_endpoint: string;
};
composeEnv.GATEWAY_AUTHGEAR_ISSUER = oidc.issuer;

interface Grant {
  id: string;
  token: string;
}

async function exchange(idToken: string, key: Awaited<ReturnType<typeof generateKeyPair>>, teams: string[]): Promise<Grant> {
  const details = [{ type: "linear", teams, actions: ENG_ACTIONS }];
  // The proof's htu is the token endpoint as Authgear sees it (the public origin, not this host's address).
  const proof = await createProof(key.privateJwk, "POST", oidc.token_endpoint);
  const res = await fetch(oidc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic, dpop: proof },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      actor_token: `sandbox-${randomBytes(4).toString("hex")}`,
      actor_token_type: "urn:authgear:params:oauth:token-type:sandbox-id",
      requested_token_type: "urn:authgear:params:oauth:token-type:agent-grant",
      resource: gatewayResource,
      authorization_details: JSON.stringify(details),
    }),
  });
  const body = (await res.json()) as { access_token?: string; token_type?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Token exchange failed: ${res.status} ${body.error ?? ""} ${body.error_description ?? ""}`);
  }
  const claims = decodeJwt(body.access_token) as Record<string, unknown> & { cnf?: { jkt?: string } };
  console.log(`teams ${teams.join(",")}:`);
  console.log(`  token_type            ${body.token_type}`);
  console.log(`  sub                   ${claims.sub}`);
  console.log(`  act                   ${JSON.stringify(claims.act)}`);
  console.log(`  grant_id              ${claims.grant_id}`);
  console.log(`  authorization_details ${JSON.stringify(claims.authorization_details)}`);
  console.log(`  cnf.jkt               ${claims.cnf?.jkt}`);
  console.log(`  exp                   ${claims.exp} (${new Date(Number(claims.exp) * 1000).toISOString()})`);
  return { id: String(claims.grant_id), token: body.access_token };
}

async function revoke(grant: Grant): Promise<void> {
  const url = new URL(`/oauth2/agent_grants/${encodeURIComponent(grant.id)}`, config.authgearEndpoint);
  const res = await fetch(url, { method: "DELETE", headers: { authorization: basic } });
  console.log(`DELETE ${url.pathname} -> ${res.status}`);
  if (res.status !== 204) throw new Error(`Revoke failed: ${res.status} ${await res.text()}`);
}

function runAgent(phase: string, grant: Grant, privateJwk: unknown): void {
  heading(`agent phase: ${phase}`);
  const status = compose(["run", "--rm", "-e", "GRANT_TOKEN", "-e", "DPOP_PRIVATE_JWK", "-e", "PHASE", "agent"], {
    GRANT_TOKEN: grant.token,
    DPOP_PRIVATE_JWK: JSON.stringify(privateJwk),
    PHASE: phase,
  });
  if (status !== 0) throw new Error(`agent phase ${phase} exited ${status}`);
}

const live = new Map<string, Grant>();
let failed = false;
try {
  heading("sign in as alice");
  const { idToken } = await login({ user: "alice", clientId: env("DEMO_CLIENT_ID", "acme-docs-demo"), scopes: [], noBrowser });
  const key = await generateKeyPair();

  heading("grant A: ENG only");
  const a = await exchange(idToken, key, ["ENG"]);
  live.set(a.id, a);

  heading("start sandbox: linear + gateway");
  if (compose(["up", "-d", "--wait", "linear", "gateway"]) !== 0) throw new Error("compose up failed");
  await waitForGateway();

  runAgent("granted", a, key.privateJwk);

  heading("revoke grant A");
  await revoke(a);
  live.delete(a.id);
  runAgent("revoked", a, key.privateJwk);

  heading("grant B: ENG + FIN (FIN is not Alice's team in Linear)");
  const b = await exchange(idToken, key, ["ENG", "FIN"]);
  live.set(b.id, b);
  runAgent("over-grant", b, key.privateJwk);

  heading("revoke grant B");
  await revoke(b);
  live.delete(b.id);
  console.log("\nagent-demo: ALL PHASES PASSED");
} catch (err) {
  failed = true;
  console.error(`\nagent-demo FAILED: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  for (const g of live.values()) {
    try {
      await revoke(g);
    } catch (err) {
      console.error(`cleanup revoke ${g.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  heading("tear down sandbox");
  compose(["down", "--remove-orphans"]);
  process.exit(failed ? 1 : 0);
}
