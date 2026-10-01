// Signs in as a demo user (authorization code + PKCE, loopback redirect), then lists and calls every tool.
//   npm run demo -- --user bob      npm run demo -- --all
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config, env } from "../src/config.ts";
import { allScopes, tools } from "../src/tools.ts";
import { login } from "./login.ts";

const clientId = env("DEMO_CLIENT_ID", "acme-docs-demo");
const mcpUrl = env("MCP_URL", `${config.publicUrl}/mcp`);
const DEMO_USERS = ["alice", "bob", "carol"];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  const value = i === -1 ? undefined : args[i + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
};

const requestedScopes = (option("scope") ?? allScopes.join(",")).split(/[,\s]+/);

// Each call runs against a document this script creates, so the seed content stays intact.
// `id` is the ID returned by create_doc. Publish runs before delete so both succeed when allowed.
function sampleArgs(stamp: number, id: string): Record<string, Record<string, unknown>> {
  return {
    search_docs: { query: "incident" },
    read_doc: { id: "handbook" },
    create_doc: { title: `Demo note ${stamp}`, body: "Created by the demo client." },
    update_doc: { id, body: "Edited by the demo client." },
    publish_doc: { id },
    delete_doc: { id },
  };
}

const callOrder = ["search_docs", "read_doc", "create_doc", "update_doc", "publish_doc", "delete_doc"];

const textOf = (content: unknown): string =>
  (content as { type: string; text?: string }[]).map((c) => c.text ?? "").join(" ").replace(/\s+/g, " ");

async function runAs(user: string): Promise<void> {
  const { accessToken } = await login({
    user,
    clientId,
    scopes: requestedScopes,
    noBrowser: flag("no-browser"),
  });
  const client = new Client({ name: "acme-docs-demo-client", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  );

  const listed = new Set((await client.listTools()).tools.map((t) => t.name));
  const stamp = Date.now();
  let docId = `demo-note-${stamp}`;

  const rows: string[][] = [];
  const ordered = [...tools].sort((a, b) => callOrder.indexOf(a.name) - callOrder.indexOf(b.name));
  for (const tool of ordered) {
    let outcome: string;
    try {
      const result = await client.callTool({ name: tool.name, arguments: sampleArgs(stamp, docId)[tool.name] });
      const text = textOf(result.content);
      if (tool.name === "create_doc" && !result.isError) docId = /Created draft "([^"]+)"/.exec(text)?.[1] ?? docId;
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
