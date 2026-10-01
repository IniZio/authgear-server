import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JWK } from "jose";
import { createProof } from "../shared/dpop.ts";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://gateway:4200/mcp";
const LINEAR_PROBE_URL = process.env.LINEAR_PROBE_URL ?? "http://linear:4300";
const EXTERNAL_PROBE_URL = process.env.EXTERNAL_PROBE_URL ?? "https://example.com";
const PHASE = process.env.PHASE ?? "granted";
const PROBE_TIMEOUT_MS = 3000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is required`);
    process.exit(2);
  }
  return v;
}

const grantToken = requireEnv("GRANT_TOKEN");
const dpopKey = JSON.parse(requireEnv("DPOP_PRIVATE_JWK")) as JWK;

const dpopFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();
  headers.set("Authorization", `DPoP ${grantToken}`);
  headers.set("DPoP", await createProof(dpopKey, method, GATEWAY_URL, grantToken));
  return fetch(input, { ...init, headers });
};

interface Row {
  name: string;
  expected: string;
  actual: string;
  ok: boolean;
}
const rows: Row[] = [];
const row = (name: string, expected: string, actual: string, ok: boolean) => rows.push({ name, expected, actual, ok });

// Text of every successful (non-error) tool result, scanned for out-of-grant data.
const successTexts: string[] = [];

const client = new Client({ name: "sandbox-agent", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(GATEWAY_URL), { fetch: dpopFetch }));

interface CallOutcome {
  isError: boolean;
  text: string;
}
async function call(name: string, args: Record<string, unknown>): Promise<CallOutcome> {
  try {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as { type: string; text?: string }[] | undefined;
    const text = content?.map((c) => c.text ?? "").join("") ?? "";
    const isError = res.isError === true;
    if (!isError) successTexts.push(text);
    return { isError, text };
  } catch (err) {
    return { isError: true, text: err instanceof Error ? err.message : String(err) };
  }
}

function parseArray(text: string): Record<string, unknown>[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}
const ids = (text: string, key: string) => parseArray(text).map((x) => String(x[key]));
const show = (v: string[]) => `[${v.join(",")}]`;
const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x));

async function rejected(auth: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...auth },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return String(res.status);
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function egressBlocked(name: string, url: string) {
  let actual: string;
  let ok: boolean;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    actual = `reached (HTTP ${res.status})`;
    ok = false;
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    actual = `blocked (${e.cause?.code ?? e.name})`;
    ok = true;
  }
  row(name, "fetch fails", actual, ok);
}

const notFoundOrDenied = (o: CallOutcome) => o.isError && /not found|denied|unavailable|unknown|error/i.test(o.text);
const emptyOrDenied = (o: CallOutcome) => notFoundOrDenied(o) || (!o.isError && o.text.trim() === "[]");

async function granted() {
  const names = (await client.listTools()).tools.map((t) => t.name);
  row("tools/list has no delete_comment", "delete_comment absent", show(names), names.length > 0 && !names.includes("delete_comment"));

  let o = await call("list_issues", {});
  let got = ids(o.text, "team");
  row("list_issues ENG only", "all team=ENG, n>0", `${got.length} items, teams ${show([...new Set(got)])}`, got.length > 0 && got.every((t) => t === "ENG"));

  o = await call("search_issues", { query: "outage" });
  got = ids(o.text, "id");
  row('search_issues "outage"', "[ENG-1]", show(got), sameSet(got, ["ENG-1"]));

  o = await call("get_issue", { id: "ENG-2" });
  let rel: unknown;
  try {
    rel = (JSON.parse(o.text) as { relations?: unknown }).relations;
  } catch {
    rel = undefined;
  }
  row("get_issue ENG-2 hides OPS-1", "relations empty", Array.isArray(rel) ? show(rel.map(String)) : o.text, Array.isArray(rel) && rel.length === 0);

  o = await call("get_issue", { id: "OPS-1" });
  row("get_issue OPS-1", "Issue OPS-1 not found", o.text, o.isError && o.text === "Issue OPS-1 not found");

  o = await call("save_comment", { issueId: "ENG-1", body: "agent was here" });
  row("save_comment on ENG-1", "ok", o.isError ? o.text : "ok", !o.isError);

  o = await call("delete_comment", { id: "C-1" });
  row("delete_comment C-1", "denied/not found", o.text, notFoundOrDenied(o));

  let status = await rejected({ authorization: `Bearer ${grantToken}` });
  row("replay with Bearer scheme", "401", status, status === "401");
  status = await rejected({ authorization: `DPoP ${grantToken}` });
  row("replay without DPoP proof", "401", status, status === "401");

  await egressBlocked("egress example.com", EXTERNAL_PROBE_URL);
  await egressBlocked("egress linear:4300", LINEAR_PROBE_URL);
}

async function revoked() {
  const names = (await client.listTools()).tools.map((t) => t.name);
  row("tools/list empty", "[]", show(names), names.length === 0);
  const script: [string, Record<string, unknown>][] = [
    ["list_teams", {}],
    ["list_issues", {}],
    ["search_issues", { query: "outage" }],
    ["get_issue", { id: "ENG-1" }],
    ["get_issue", { id: "OPS-1" }],
    ["save_comment", { issueId: "ENG-1", body: "should not land" }],
    ["delete_comment", { id: "C-1" }],
  ];
  for (const [name, args] of script) {
    const o = await call(name, args);
    row(`${name} ${JSON.stringify(args)}`, "denied/not found/empty", o.text, emptyOrDenied(o));
  }
}

async function overGrant() {
  let o = await call("list_issues", {});
  let got = ids(o.text, "team");
  row("list_issues ENG only", "all team=ENG, n>0", `${got.length} items, teams ${show([...new Set(got)])}`, got.length > 0 && got.every((t) => t === "ENG"));

  o = await call("get_issue", { id: "FIN-1" });
  row("get_issue FIN-1", "Issue FIN-1 not found", o.text, o.isError && o.text === "Issue FIN-1 not found");

  o = await call("list_teams", {});
  got = ids(o.text, "key");
  row("list_teams ENG only", "[ENG]", show(got), sameSet(got, ["ENG"]));
}

if (PHASE === "granted") await granted();
else if (PHASE === "revoked") await revoked();
else if (PHASE === "over-grant") await overGrant();
else {
  console.error(`unknown PHASE ${PHASE}`);
  process.exit(2);
}

const leak = /\b(FIN|OPS)-\d|"(FIN|OPS)"|Finance|Operations/;
const leaked = successTexts.filter((t) => leak.test(t));
row("no FIN/OPS data in results", "none", leaked.length ? `${leaked.length} result(s) leaked` : "none", leaked.length === 0);

await client.close().catch(() => {});

const clip = (s: string, n = 60) => {
  const one = s.replace(/\s+/g, " ");
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const w = (f: (r: Row) => string, h: string) => Math.max(h.length, ...rows.map((r) => f(r).length));
const wn = w((r) => clip(r.name), "ROW");
const we = w((r) => clip(r.expected), "EXPECTED");
const wa = w((r) => clip(r.actual), "ACTUAL");
console.log(`phase: ${PHASE}`);
console.log(`RESULT  ${"ROW".padEnd(wn)}  ${"EXPECTED".padEnd(we)}  ACTUAL`);
for (const r of rows) {
  console.log(`${r.ok ? "PASS  " : "FAIL  "}  ${clip(r.name).padEnd(wn)}  ${clip(r.expected).padEnd(we)}  ${clip(r.actual).padEnd(wa)}`);
}
const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.log(`FAILED: ${failed.map((r) => r.name).join("; ")}`);
  process.exit(1);
}
console.log(`ALL ${rows.length} PASS`);
