// Signs in as a demo user (authorization code + PKCE, loopback redirect), then lists and calls every tool.
//   npm run demo -- --user bob      npm run demo -- --all
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config, env } from "../src/config.ts";
import { tools } from "../src/tools.ts";

const clientId = env("DEMO_CLIENT_ID", "acme-docs-demo");
const mcpUrl = env("MCP_URL", `${config.publicUrl}/mcp`);
const DEMO_USERS = ["alice", "bob", "carol"];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args[args.indexOf(`--${name}`) + 1];

const requestedScopes = (option("scope") ?? tools.map((t) => t.scope).join(",")).split(/[,\s]+/);

const b64url = (b: Buffer) => b.toString("base64url");

function openBrowser(url: string): void {
  if (flag("no-browser")) return;
  const [cmd, ...rest] =
    process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", '""'] : ["xdg-open"];
  const child = spawn(cmd!, [...rest, url], { stdio: "ignore", detached: true });
  child.on("error", (err) => console.warn(`Could not open a browser (${err.message}); open the URL manually.`));
  child.unref();
}

/** Waits for the redirect on an ephemeral loopback port and resolves with the authorization code. */
function listenForCode(state: string): { redirectUri: Promise<string>; code: Promise<string> } {
  let resolveUri!: (u: string) => void;
  const redirectUri = new Promise<string>((r) => (resolveUri = r));
  const code = new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const ok = !error && url.searchParams.get("state") === state && url.searchParams.has("code");
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html" });
      res.end(
        `<body style="font:16px system-ui;text-align:center;margin-top:20vh">${ok ? "Signed in. You can close this tab." : "Sign-in failed."}</body>`,
      );
      server.close();
      if (ok) resolve(url.searchParams.get("code")!);
      else reject(new Error(error ? `${error}: ${url.searchParams.get("error_description")}` : "state mismatch"));
    });
    server.listen(0, "127.0.0.1", () => {
      resolveUri(`http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`);
    });
    setTimeout(() => reject(new Error("Timed out waiting for sign-in")), 5 * 60_000).unref();
  });
  return { redirectUri, code };
}

async function login(user: string): Promise<string> {
  const oidc = (await (await fetch(`${config.authgearEndpoint}/.well-known/openid-configuration`)).json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
  };
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const listener = listenForCode(state);
  const redirectUri = await listener.redirectUri;

  const authorize = new URL(oidc.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ["openid", "profile", ...requestedScopes].join(" "),
    resource: config.resourceUri,
    state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "login", // so --all can switch users in the same browser
  }).toString();

  console.log(`\nSign in as ${user} (password Demo1234!):\n  ${authorize}`);
  openBrowser(authorize.href);

  const res = await fetch(oidc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: await listener.code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: config.resourceUri,
    }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Token request failed: ${body.error_description ?? res.status}`);
  return body.access_token;
}

// Each call runs against a document this script creates, so the seed content stays intact.
function sampleArgs(stamp: number): Record<string, Record<string, unknown>> {
  const id = `demo-note-${stamp}`;
  return {
    search_docs: { query: "incident" },
    read_doc: { id: "handbook" },
    create_doc: { title: `Demo note ${stamp}`, body: "Created by the demo client." },
    update_doc: { id, body: "Edited by the demo client." },
    publish_doc: { id },
    delete_doc: { id },
  };
}

const textOf = (content: unknown): string =>
  (content as { type: string; text?: string }[]).map((c) => c.text ?? "").join(" ").replace(/\s+/g, " ");

async function runAs(user: string): Promise<void> {
  const accessToken = await login(user);
  const client = new Client({ name: "acme-docs-demo-client", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  );

  const listed = new Set((await client.listTools()).tools.map((t) => t.name));
  const samples = sampleArgs(Date.now());

  const rows: string[][] = [];
  for (const tool of tools) {
    let outcome: string;
    try {
      const result = await client.callTool({ name: tool.name, arguments: samples[tool.name] });
      const text = textOf(result.content);
      outcome = result.isError ? `DENIED  ${text}` : `ok      ${text}`;
    } catch (err) {
      outcome =
        err instanceof StreamableHTTPError && err.code === 403
          ? `STEP-UP 403 insufficient_scope (token lacks ${tool.scope})`
          : `ERROR   ${(err as Error).message}`;
    }
    rows.push([tool.name, tool.scope, listed.has(tool.name) ? "yes" : "no", outcome]);
  }
  await client.close();

  console.log(`\n=== ${user} ===`);
  printTable(["tool", "scope", "listed", "call result"], rows);
}

function printTable(head: string[], rows: string[][]): void {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) => console.log(line(r)));
}

const users = flag("all") ? DEMO_USERS : option("user") ? [option("user")!] : [];
if (users.length === 0) {
  console.error("Usage: npm run demo -- --user <alice|bob|carol> | --all  [--scope docs:read,docs:write] [--no-browser]");
  process.exit(2);
}

try {
  for (const user of users) await runAs(user);
} catch (err) {
  console.error(`\nDemo failed: ${(err as Error).message}`);
  process.exitCode = 1;
}
