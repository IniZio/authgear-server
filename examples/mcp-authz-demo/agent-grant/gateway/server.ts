import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { publish } from "../../src/console/events.ts";
import { consoleRouter } from "../../src/console/router.ts";
import { AuthError, authenticate, gatewayConfig, type GrantAuth } from "./auth.ts";
import { filterResponse } from "./filter.ts";
import { needsResolver, notFoundText, rewriteListArgs, toAuthzenRequests, toolAction, type Args } from "./mapping.ts";
import { createPdp, PdpUnavailableError } from "./pdp.ts";
import { createResolver, createUpstream, resultText, type Upstream } from "./resolver.ts";

const LIST_TOOLS = ["list_issues", "search_issues"];
const text = (t: string, isError = false) => ({ ...(isError ? { isError } : {}), content: [{ type: "text" as const, text: t }] });
const deny = (t: string) => text(t, true);
const noTiming = { latencyMs: null, cache: null };

/** Issue ids that appear only as references: relations, parent, comment.issueId. */
function refIds(body: unknown, out: string[] = []): string[] {
  if (Array.isArray(body)) body.forEach((b) => refIds(b, out));
  else if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.relations)) out.push(...o.relations.filter((r): r is string => typeof r === "string"));
    if (typeof o.parent === "string") out.push(o.parent);
    if (typeof o.issueId === "string") out.push(o.issueId);
  }
  return out;
}

function createMcpServer(up: Upstream): Server {
  const server = new Server({ name: "linear-gateway", version: "0.1.0" }, { capabilities: { tools: {} } });
  const authOf = (extra: { authInfo?: AuthInfo }): GrantAuth => extra.authInfo!.extra as unknown as GrantAuth;
  const detail = (a: GrantAuth, teams: string[]) => `act=${a.actor} grant=${a.grantId} team=${teams.join(",") || "-"}`;

  server.setRequestHandler(ListToolsRequestSchema, async (_req, extra) => {
    const auth = authOf(extra);
    const pdp = createPdp(auth);
    const ev = { user: auth.sub, tool: "tools/list", kind: "list" as const, ...noTiming };
    try {
      const upstream = await up.listTools();
      const actions = [...new Set(upstream.flatMap((t) => toolAction(t.name) ?? []))];
      const found = new Map(await Promise.all(actions.map(async (a) => [a, await pdp.searchTeams(a)] as const)));
      const visible = upstream.filter((t) => (found.get(toolAction(t.name) ?? "")?.length ?? 0) > 0);
      const teams = [...new Set([...found.values()].flat())];
      publish({
        ...ev,
        action: `${actions.length} actions`,
        decision: "allow",
        detail: `${detail(auth, teams)} showing ${visible.length}/${upstream.length} tools`,
      });
      return { tools: visible };
    } catch (err) {
      if (!(err instanceof PdpUnavailableError)) throw err;
      console.error(`[pdp] ${err.message}`);
      publish({ ...ev, action: "-", decision: "error", detail: `${detail(auth, [])} ${err.message}` });
      throw new McpError(ErrorCode.InternalError, "authorization unavailable");
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const auth = authOf(extra);
    const tool = req.params.name;
    const action = toolAction(tool);
    if (!action) throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${tool}`);
    const args = (req.params.arguments ?? {}) as Args;
    const pdp = createPdp(auth);
    const resolver = createResolver(up);
    const ev = { user: auth.sub, tool, action, kind: "call" as const, ...noTiming };
    const allow = (teams: string[]) => publish({ ...ev, decision: "allow", detail: detail(auth, teams) });
    const denied = (teams: string[]) => publish({ ...ev, decision: "deny", detail: detail(auth, teams) });

    try {
      if (tool === "list_teams" || LIST_TOOLS.includes(tool)) {
        const allowed = await pdp.searchTeams(action);
        let calls: Args[] = [args];
        if (LIST_TOOLS.includes(tool)) {
          const rewritten = rewriteListArgs(args, allowed);
          if ("empty" in rewritten) {
            denied(allowed);
            return text("[]");
          }
          // Upstream list_issues takes one team; search_issues has no team filter, the response filter covers it.
          const team = rewritten.args.team;
          calls = !Array.isArray(team)
            ? [rewritten.args]
            : tool === "list_issues"
              ? team.map((t) => ({ ...rewritten.args, team: t }))
              : [{ ...rewritten.args, team: undefined }];
        }
        const results = await Promise.all(calls.map((a) => up.callTool(tool, JSON.parse(JSON.stringify(a)))));
        const failed = results.find((r) => r.isError);
        if (failed) return failed;
        const body = results.flatMap((r) => JSON.parse(resultText(r)) as unknown[]);
        const lookup = await resolver.lookup(refIds(body));
        allow(allowed);
        return text(JSON.stringify(filterResponse(tool, body, allowed, lookup)));
      }

      const need = needsResolver(tool, args);
      const resolved = need ? await resolver.resolve(need) : {};
      const reqs = toAuthzenRequests(tool, args, resolved);
      const teams = [...new Set(reqs.map((r) => r.resource.properties.team))];
      const nf = () => {
        if (need) return notFoundText(need.kind, need.id);
        return `Team ${typeof args.team === "string" ? args.team : ""} not found`;
      };
      if (!(await pdp.evaluateAll(reqs))) {
        denied(teams);
        return deny(nf());
      }

      const result = await up.callTool(tool, args);
      allow(teams);
      if (result.isError) return result;
      const body = JSON.parse(resultText(result)) as unknown;
      const allowed = await pdp.searchTeams(action);
      const filtered = filterResponse(tool, body, allowed, await resolver.lookup(refIds(body)));
      return filtered === null ? deny(nf()) : text(JSON.stringify(filtered));
    } catch (err) {
      if (!(err instanceof PdpUnavailableError)) throw err;
      console.error(`[pdp] ${err.message}`);
      publish({ ...ev, decision: "error", detail: `${detail(auth, [])} ${err.message}; failing closed` });
      return deny("Authorization unavailable; request denied.");
    }
  });

  return server;
}

const app = express();
app.use(express.json());
app.use(consoleRouter);

app.post("/mcp", async (req, res) => {
  const up = createUpstream();
  try {
    const grant = await authenticate(req);
    const authInfo: AuthInfo = { token: "", clientId: grant.actor, scopes: [], extra: { ...grant } };
    const server = createMcpServer(up);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
      void up.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(Object.assign(req, { auth: authInfo }), res, req.body);
  } catch (err) {
    void up.close().catch(() => {});
    if (err instanceof AuthError) {
      res.status(err.status).set("WWW-Authenticate", err.challenge).json({ error: err.message });
      return;
    }
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: ErrorCode.InternalError, message: "Internal error" }, id: null });
    }
  }
});

// Stateless: no server-initiated streams or sessions.
const notAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
};
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

app.listen(gatewayConfig.port, gatewayConfig.host, () => {
  console.log(`[gateway] Linear gateway on ${gatewayConfig.host}:${gatewayConfig.port} (/mcp, /console)`);
});
