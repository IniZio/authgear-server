import { config, pdpCredentials } from "./config.ts";

export type CacheStatus = "hit" | "miss" | "unknown";

export interface Timing {
  /** PDP-reported processing time, or the measured round trip if the header is absent. */
  ms: number;
  cache: CacheStatus;
}

/** The PDP could not give an answer. Callers must treat this as a denial. */
export class PdpUnavailableError extends Error {}

const resource = { type: "authgear:resource", id: config.resourceUri };
const subject = (userId: string) => ({ type: "user", id: userId });

// Server-Timing: pdp;dur=1.3;desc="cache-hit"
function parseServerTiming(header: string | null, measuredMs: number): Timing {
  const m = header?.match(/(?:^|,)\s*pdp\s*;([^,]*)/);
  if (!m?.[1]) return { ms: measuredMs, cache: "unknown" };
  const dur = m[1].match(/dur=([\d.]+)/);
  const desc = m[1].match(/desc="?cache-(hit|miss)"?/);
  return {
    ms: dur?.[1] ? Number(dur[1]) : measuredMs,
    cache: desc?.[1] === "hit" ? "hit" : desc?.[1] === "miss" ? "miss" : "unknown",
  };
}

async function post(path: string, body: unknown): Promise<{ json: unknown; timing: Timing }> {
  const { clientId, clientSecret } = pdpCredentials();
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64");
  const started = performance.now();
  try {
    const res = await fetch(`${config.authgearEndpoint}/access/v1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${basic}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.pdpTimeoutMs),
    });
    const measured = performance.now() - started;
    if (!res.ok) throw new PdpUnavailableError(`PDP responded ${res.status}`);
    return { json: await res.json(), timing: parseServerTiming(res.headers.get("server-timing"), measured) };
  } catch (err) {
    if (err instanceof PdpUnavailableError) throw err;
    throw new PdpUnavailableError(`PDP request failed: ${(err as Error).message}`);
  }
}

export interface Decision {
  allowed: boolean;
  timing: Timing;
}

export async function evaluate(userId: string, scope: string): Promise<Decision> {
  const { json, timing } = await post("evaluation", {
    subject: subject(userId),
    resource,
    action: { name: scope },
  });
  const decision = (json as { decision?: unknown }).decision;
  if (typeof decision !== "boolean") throw new PdpUnavailableError("PDP returned a malformed decision");
  return { allowed: decision, timing };
}

/** Decisions for many scopes in one round trip. */
export async function evaluateMany(
  userId: string,
  scopes: string[],
): Promise<{ allowed: Map<string, boolean>; timing: Timing }> {
  const { json, timing } = await post("evaluations", {
    subject: subject(userId),
    resource,
    evaluations: scopes.map((name) => ({ action: { name } })),
    options: { evaluations_semantic: "execute_all" },
  });
  const items = (json as { evaluations?: { decision?: unknown }[] }).evaluations;
  if (!Array.isArray(items) || items.length !== scopes.length) {
    throw new PdpUnavailableError("PDP returned a malformed batch response");
  }
  const allowed = new Map<string, boolean>();
  for (const [i, scope] of scopes.entries()) {
    const d = items[i]?.decision;
    if (typeof d !== "boolean") throw new PdpUnavailableError("PDP returned a malformed decision");
    allowed.set(scope, d);
  }
  return { allowed, timing };
}
