import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { comments, issues, memberTeams, teams, type Comment, type Issue, type TeamKey } from "./data.ts";

const port = Number(process.env.LINEAR_PORT ?? 4300);
const apiKey = process.env.LINEAR_API_KEY ?? "linear-demo-key";

class ToolError extends Error {}

const isMember = (team: string) => (memberTeams as readonly string[]).includes(team);
const visibleIssues = () => issues.filter((i) => isMember(i.team));
const findIssue = (id: unknown): Issue => {
  const issue = visibleIssues().find((i) => i.id === id);
  if (!issue) throw new ToolError(`Issue ${String(id)} not found`);
  return issue;
};
const findComment = (id: unknown): Comment => {
  const c = comments.find((c) => c.id === id && isMember(issues.find((i) => i.id === c.issueId)?.team ?? ""));
  if (!c) throw new ToolError(`Comment ${String(id)} not found`);
  return c;
};
const matches = (i: Issue, query: unknown) =>
  typeof query !== "string" || i.title.toLowerCase().includes(query.toLowerCase());
const str = (v: unknown, name: string): string => {
  if (typeof v !== "string" || v === "") throw new ToolError(`${name} is required`);
  return v;
};

type Args = Record<string, unknown>;

const tools: { name: string; description: string; inputSchema: object; run: (a: Args) => unknown }[] = [
  {
    name: "list_teams",
    description: "List teams you belong to",
    inputSchema: { type: "object", properties: {} },
    run: () => teams.filter((t) => isMember(t.key)),
  },
  {
    name: "list_issues",
    description: "List issues, optionally filtered by team and text query",
    inputSchema: { type: "object", properties: { team: { type: "string" }, query: { type: "string" } } },
    run: (a) => visibleIssues().filter((i) => (a.team === undefined || i.team === a.team) && matches(i, a.query)),
  },
  {
    name: "search_issues",
    description: "Search issues by text",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: (a) => visibleIssues().filter((i) => matches(i, str(a.query, "query"))),
  },
  {
    name: "get_issue",
    description: "Get an issue by id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (a) => findIssue(a.id),
  },
  {
    name: "save_issue",
    description: "Create an issue, or update it when id is given",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, team: { type: "string" }, title: { type: "string" } },
      required: ["team", "title"],
    },
    run: (a) => {
      const team = str(a.team, "team");
      if (!isMember(team)) throw new ToolError(`Team ${team} not found`);
      const title = str(a.title, "title");
      if (a.id !== undefined) {
        const issue = findIssue(a.id);
        issue.team = team as TeamKey;
        issue.title = title;
        return issue;
      }
      const n = issues.filter((i) => i.team === team).length + 1;
      const issue: Issue = { id: `${team}-${n}`, team: team as TeamKey, title, relations: [] };
      issues.push(issue);
      return issue;
    },
  },
  {
    name: "list_comments",
    description: "List comments of an issue",
    inputSchema: { type: "object", properties: { issueId: { type: "string" } }, required: ["issueId"] },
    run: (a) => {
      const issue = findIssue(a.issueId);
      return comments.filter((c) => c.issueId === issue.id);
    },
  },
  {
    name: "save_comment",
    description: "Create a comment on an issue, or update it when id is given",
    inputSchema: {
      type: "object",
      properties: { issueId: { type: "string" }, body: { type: "string" }, id: { type: "string" } },
      required: ["issueId", "body"],
    },
    run: (a) => {
      const issue = findIssue(a.issueId);
      const body = str(a.body, "body");
      if (a.id !== undefined) {
        const c = findComment(a.id);
        c.body = body;
        return c;
      }
      const c: Comment = { id: `C-${comments.length + 1}`, issueId: issue.id, body };
      comments.push(c);
      return c;
    },
  },
  {
    name: "delete_comment",
    description: "Delete a comment by id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (a) => {
      const c = findComment(a.id);
      comments.splice(comments.indexOf(c), 1);
      return { deleted: c.id };
    },
  },
  {
    name: "get_comment",
    description: "Get a comment by id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (a) => findComment(a.id),
  },
];

/** Stateless: one MCP server per request. */
function createMcpServer(): Server {
  const server = new Server({ name: "fake-linear", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: inputSchema as { type: "object" },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${req.params.name}`);
    const args = (req.params.arguments ?? {}) as Args;
    console.log(`[linear] tools/call ${tool.name} ${JSON.stringify(args)}`);
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(tool.run(args)) }] };
    } catch (err) {
      if (!(err instanceof ToolError)) throw err;
      return { isError: true, content: [{ type: "text" as const, text: err.message }] };
    }
  });
  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "unauthorized" });
    return;
  }
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(port, () => console.log(`[linear] fake Linear MCP server on http://localhost:${port}/mcp`));
