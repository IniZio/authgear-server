import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { AuthError, authenticate, insufficientScope, resourceMetadataUrl, userLabel } from "./auth.ts";
import { config } from "./config.ts";
import { publish } from "./console/events.ts";
import { consoleRouter } from "./console/router.ts";
import { evaluate, evaluateMany, PdpUnavailableError, type Timing } from "./pdp.ts";
import { allScopes, toolByName, tools, ToolError } from "./tools.ts";

const subOf = (auth: AuthInfo) => String(auth.extra?.sub);

const timingFields = (t: Timing) => ({ latencyMs: t.ms, cache: t.cache });
const noTiming = { latencyMs: null, cache: null };

/** One MCP server per request: authorization is evaluated per request, never per connection. */
function createMcpServer(): Server {
  const server = new Server({ name: "acme-docs", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async (_req, extra) => {
    const auth = extra.authInfo!;
    const user = await userLabel(auth);
    try {
      const { allowed, timing } = await evaluateMany(subOf(auth), allScopes);
      const visible = tools.filter((t) => auth.scopes.includes(t.scope) && allowed.get(t.scope));
      const granted = allScopes.filter((s) => allowed.get(s));
      publish({
        user,
        tool: "tools/list",
        action: `${allScopes.length} scopes`,
        kind: "list",
        decision: "allow",
        ...timingFields(timing),
        detail: `Authgear grants ${granted.join(", ") || "nothing"}; token has ${auth.scopes.join(", ") || "no scopes"}; showing ${visible.length}/${tools.length} tools`,
      });
      return {
        tools: visible.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema: inputSchema as { type: "object" },
        })),
      };
    } catch (err) {
      if (!(err instanceof PdpUnavailableError)) throw err;
      console.error(`[pdp] ${err.message}`);
      publish({ user, tool: "tools/list", action: `${allScopes.length} scopes`, kind: "list", decision: "error", ...noTiming, detail: err.message });
      throw new McpError(ErrorCode.InternalError, "authorization unavailable");
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const auth = extra.authInfo!;
    const tool = toolByName(req.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${req.params.name}`);

    const user = await userLabel(auth);
    const base = { user, tool: tool.name, action: tool.scope, kind: "call" as const };
    const deny = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });

    let allowed: boolean;
    let timing: Timing;
    try {
      ({ allowed, timing } = await evaluate(subOf(auth), tool.scope));
    } catch (err) {
      if (!(err instanceof PdpUnavailableError)) throw err;
      console.error(`[pdp] ${err.message}`);
      publish({ ...base, decision: "error", ...noTiming, detail: `${err.message}; failing closed` });
      return deny("Authorization unavailable; request denied.");
    }

    if (!allowed) {
      const grants = await describeGrants(subOf(auth));
      const text = `Authgear denied \`${tool.scope}\` for ${user}${grants ? ` (role grants: ${grants})` : ""}`;
      publish({ ...base, decision: "deny", ...timingFields(timing), detail: text });
      return deny(text);
    }

    try {
      const text = tool.run(req.params.arguments);
      publish({ ...base, decision: "allow", ...timingFields(timing), detail: `Authgear granted ${tool.scope}` });
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      if (!(err instanceof ToolError)) throw err;
      publish({ ...base, decision: "allow", ...timingFields(timing), detail: `Allowed; tool failed: ${err.message}` });
      return deny(err.message);
    }
  });

  return server;
}

/** Scopes the user holds, for the denial message. Best effort; never changes the decision. */
async function describeGrants(sub: string): Promise<string> {
  try {
    const { allowed } = await evaluateMany(sub, allScopes);
    return allScopes.filter((s) => allowed.get(s)).join(", ");
  } catch (err) {
    console.warn(`[pdp] could not explain denial: ${(err as Error).message}`);
    return "";
  }
}

/** The first tool call in the JSON-RPC body whose scope the token lacks. */
function missingScope(body: unknown, auth: AuthInfo): { tool: string; scope: string } | undefined {
  for (const msg of Array.isArray(body) ? body : [body]) {
    if (msg?.method !== "tools/call") continue;
    const tool = toolByName(msg.params?.name);
    if (tool && !auth.scopes.includes(tool.scope)) return { tool: tool.name, scope: tool.scope };
  }
  return undefined;
}

const app = express();
app.use(express.json());

const metadata = (_req: express.Request, res: express.Response) => {
  res.json({
    resource: config.resourceUri,
    authorization_servers: [config.authgearEndpoint],
    scopes_supported: ["docs:read"],
    bearer_methods_supported: ["header"],
    resource_name: "Acme Docs",
  });
};
app.get("/.well-known/oauth-protected-resource", metadata);
app.get("/.well-known/oauth-protected-resource/mcp", metadata);

app.use(consoleRouter);

app.post("/mcp", async (req, res) => {
  try {
    const auth = await authenticate(req);

    const missing = missingScope(req.body, auth);
    if (missing) {
      const user = await userLabel(auth);
      publish({
        user,
        tool: missing.tool,
        action: missing.scope,
        kind: "call",
        decision: "stepup",
        ...noTiming,
        detail: `Token lacks ${missing.scope}; asked client to step up`,
      });
      throw insufficientScope(missing.scope);
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(Object.assign(req, { auth }), res, req.body);
  } catch (err) {
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
  res
    .status(405)
    .set("Allow", "POST")
    .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
};
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

app.listen(config.port, config.host, () => {
  console.log(`Listening on    ${config.host}:${config.port}`);
  console.log(`Acme Docs MCP   ${config.publicUrl}/mcp`);
  console.log(`Decision Console ${config.publicUrl}/console`);
  console.log(`Resource metadata ${resourceMetadataUrl}`);
});
