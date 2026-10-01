import { EventEmitter } from "node:events";
import type { CacheStatus } from "../pdp.ts";

export interface DecisionEvent {
  id: number;
  time: string;
  user: string;
  /** "tools/list" for the batch evaluation, else the tool name. */
  tool: string;
  action: string;
  /** `stepup` means the token lacked the scope, so the PDP was never asked. */
  decision: "allow" | "deny" | "error" | "stepup";
  /** The tool call outcome is a PDP decision; `list` is one batch call. */
  kind: "list" | "call";
  latencyMs: number | null;
  cache: CacheStatus | null;
  detail: string;
}

export interface Stats {
  decisionsPerMin: number;
  allowRatio: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  cacheHitRatio: number | null;
}

const MAX_EVENTS = 500;
const RATE_WINDOW_MS = 60_000;
const LATENCY_WINDOW_MS = 5 * 60_000;

const history: DecisionEvent[] = [];
let nextId = 1;

export const bus = new EventEmitter();

export function publish(e: Omit<DecisionEvent, "id" | "time">): DecisionEvent {
  const event: DecisionEvent = { id: nextId++, time: new Date().toISOString(), ...e };
  history.push(event);
  if (history.length > MAX_EVENTS) history.shift();
  bus.emit("decision", event);
  return event;
}

export const recent = (n = 50) => history.slice(-n);

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? null;
}

export function stats(now = Date.now()): Stats {
  const within = (ms: number) => history.filter((e) => now - Date.parse(e.time) <= ms);
  const asked = (e: DecisionEvent) => e.decision !== "stepup";

  const lastMinute = within(RATE_WINDOW_MS).filter(asked);
  const window = within(LATENCY_WINDOW_MS).filter(asked);

  const calls = window.filter((e) => e.kind === "call" && (e.decision === "allow" || e.decision === "deny"));
  const latencies = window.flatMap((e) => (e.latencyMs === null ? [] : [e.latencyMs])).sort((a, b) => a - b);
  const cached = window.filter((e) => e.cache === "hit" || e.cache === "miss");

  return {
    decisionsPerMin: lastMinute.length,
    allowRatio: calls.length ? calls.filter((e) => e.decision === "allow").length / calls.length : null,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    cacheHitRatio: cached.length ? cached.filter((e) => e.cache === "hit").length / cached.length : null,
  };
}
