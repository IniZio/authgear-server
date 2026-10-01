import { readFile } from "node:fs/promises";
import { Router } from "express";
import { config } from "../config.ts";
import { bus, recent, stats, type DecisionEvent } from "./events.ts";

const page = new URL("./public/index.html", import.meta.url);

export const consoleRouter = Router();

consoleRouter.get("/console", async (_req, res) => {
  res.type("html").send(await readFile(page, "utf8"));
});

consoleRouter.get("/console/config", (_req, res) => {
  res.json({
    rolesUrl: `${config.portalUrl}/project/${config.appId}/user-management/roles`,
    resource: config.resourceUri,
  });
});

consoleRouter.get("/console/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("snapshot", { events: recent(), stats: stats() });
  const onDecision = (e: DecisionEvent) => {
    send("decision", e);
    send("stats", stats());
  };
  bus.on("decision", onDecision);
  // Rates decay when traffic stops, so refresh them periodically.
  const tick = setInterval(() => send("stats", stats()), 5000);

  req.on("close", () => {
    bus.off("decision", onDecision);
    clearInterval(tick);
  });
});
