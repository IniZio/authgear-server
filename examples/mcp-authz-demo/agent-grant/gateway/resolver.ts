import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { gatewayConfig } from "./auth.ts";
import type { Args, ResolverNeed, Resolved } from "./mapping.ts";
import type { TeamLookup } from "./filter.ts";

export type UpstreamResult = CallToolResult;

/** Upstream Linear MCP, authenticated with the gateway's own API key. One connection per gateway request. */
export function createUpstream() {
  let client: Promise<Client> | undefined;
  const get = () =>
    (client ??= (async () => {
      const c = new Client({ name: "linear-gateway", version: "0.1.0" });
      await c.connect(
        new StreamableHTTPClientTransport(new URL(gatewayConfig.linearUrl), {
          requestInit: { headers: { authorization: `Bearer ${gatewayConfig.linearApiKey}` } },
        }),
      );
      return c;
    })());
  return {
    async listTools() {
      return (await (await get()).listTools()).tools;
    },
    async callTool(name: string, args: Args): Promise<UpstreamResult> {
      return (await (await get()).callTool({ name, arguments: args })) as UpstreamResult;
    },
    async close() {
      if (client) await (await client).close();
    },
  };
}
export type Upstream = ReturnType<typeof createUpstream>;

export const resultText = (r: UpstreamResult): string => (r.content.find((c) => c.type === "text") as { text: string } | undefined)?.text ?? "";

/** Resolves ids to teams with read-only upstream lookups, memoized per request. */
// TOCTOU: the team is read before the call; the upstream object may move teams in between.
export function createResolver(up: Upstream) {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    let p = memo.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      memo.set(key, p);
    }
    return p;
  };
  const read = async (tool: string, args: Args): Promise<Record<string, unknown> | undefined> => {
    const r = await up.callTool(tool, args);
    return r.isError ? undefined : (JSON.parse(resultText(r)) as Record<string, unknown>);
  };
  const issueTeam = (id: string) =>
    once(`issue:${id}`, async () => {
      const team = (await read("get_issue", { id }))?.team;
      return typeof team === "string" ? team : undefined;
    });
  const commentTeam = (id: string) =>
    once(`comment:${id}`, async () => {
      const issueId = (await read("get_comment", { id }))?.issueId;
      return typeof issueId === "string" ? issueTeam(issueId) : undefined;
    });

  return {
    async resolve(need: ResolverNeed): Promise<Resolved> {
      const team = await (need.kind === "issue" ? issueTeam(need.id) : commentTeam(need.id));
      return team ? { team } : {};
    },
    async lookup(issueIds: string[]): Promise<TeamLookup> {
      const out: TeamLookup = {};
      await Promise.all(
        [...new Set(issueIds)].map(async (id) => {
          const team = await issueTeam(id);
          if (team) out[id] = team;
        }),
      );
      return out;
    },
  };
}
