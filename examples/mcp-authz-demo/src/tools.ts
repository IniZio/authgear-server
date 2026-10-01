import { z } from "zod";
import { store, type Doc } from "./store.ts";

/** Thrown by a handler for an expected failure; surfaces as an `isError` tool result. */
export class ToolError extends Error {}

export interface Tool {
  name: string;
  /** Authgear Scope that guards the tool. */
  scope: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: unknown): string;
}

function defineTool<S extends z.ZodObject>(def: {
  name: string;
  scope: string;
  description: string;
  input: S;
  run(args: z.infer<S>): string;
}): Tool {
  return {
    name: def.name,
    scope: def.scope,
    description: `${def.description} (requires ${def.scope})`,
    inputSchema: z.toJSONSchema(def.input, { io: "input" }) as Record<string, unknown>,
    run: (args) => {
      const parsed = def.input.safeParse(args ?? {});
      if (!parsed.success) throw new ToolError(z.prettifyError(parsed.error));
      return def.run(parsed.data);
    },
  };
}

const docId = z.string().describe("Document ID, e.g. `handbook`");

const need = (doc: Doc | undefined, id: string): Doc => {
  if (!doc) throw new ToolError(`No document with id "${id}"`);
  return doc;
};

const summary = (d: Doc) => `- ${d.id}: ${d.title} [${d.status}]`;

export const tools: Tool[] = [
  defineTool({
    name: "search_docs",
    scope: "docs:read",
    description: "Search documents by keyword in title or body",
    input: z.object({ query: z.string().describe("Keyword to look for") }),
    run: ({ query }) => {
      const hits = store.search(query);
      return hits.length ? hits.map(summary).join("\n") : `No documents match "${query}".`;
    },
  }),
  defineTool({
    name: "read_doc",
    scope: "docs:read",
    description: "Read a document",
    input: z.object({ id: docId }),
    run: ({ id }) => {
      const d = need(store.get(id), id);
      return `# ${d.title} [${d.status}]\n\n${d.body}`;
    },
  }),
  defineTool({
    name: "create_doc",
    scope: "docs:write",
    description: "Create a draft document",
    input: z.object({ title: z.string().min(1), body: z.string() }),
    run: ({ title, body }) => `Created draft "${store.create(title, body).id}".`,
  }),
  defineTool({
    name: "update_doc",
    scope: "docs:write",
    description: "Update a document's title or body",
    input: z.object({ id: docId, title: z.string().min(1).optional(), body: z.string().optional() }),
    run: ({ id, ...patch }) => `Updated "${need(store.update(id, patch), id).id}".`,
  }),
  defineTool({
    name: "delete_doc",
    scope: "docs:delete",
    description: "Permanently delete a document",
    input: z.object({ id: docId }),
    run: ({ id }) => {
      if (!store.remove(id)) throw new ToolError(`No document with id "${id}"`);
      return `Deleted "${id}".`;
    },
  }),
  defineTool({
    name: "publish_doc",
    scope: "docs:publish",
    description: "Publish a draft document",
    input: z.object({ id: docId }),
    run: ({ id }) => `Published "${need(store.publish(id), id).id}".`,
  }),
];

export const toolByName = (name: string) => tools.find((t) => t.name === name);

export const allScopes = [...new Set(tools.map((t) => t.scope))];
