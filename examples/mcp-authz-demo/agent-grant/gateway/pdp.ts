import type { AuthzenRequest } from "./mapping.ts";
import { gatewayConfig, type GrantAuth } from "./auth.ts";

/** The PDP could not give an answer. Callers must treat this as a denial. */
export class PdpUnavailableError extends Error {}

async function post(path: string, body: unknown): Promise<unknown> {
  const { pdpClientId, pdpClientSecret, authgearEndpoint, pdpTimeoutMs } = gatewayConfig;
  const basic = Buffer.from(`${encodeURIComponent(pdpClientId)}:${encodeURIComponent(pdpClientSecret)}`).toString("base64");
  try {
    const res = await fetch(`${authgearEndpoint}/access/v1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${basic}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(pdpTimeoutMs),
    });
    if (!res.ok) throw new PdpUnavailableError(`PDP responded ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof PdpUnavailableError) throw err;
    throw new PdpUnavailableError(`PDP request failed: ${(err as Error).message}`);
  }
}

/** Per-request PDP client bound to one grant; searches are memoized. */
export function createPdp(auth: GrantAuth) {
  const subject = { type: "user", id: auth.sub };
  const context = { grant_id: auth.grantId, actor: auth.actor };
  const searches = new Map<string, Promise<string[]>>();

  async function evaluate(r: AuthzenRequest): Promise<boolean> {
    // AuthZEN requires resource.id; a create has none yet.
    const resource = { ...r.resource, id: r.resource.id ?? "new" };
    const json = (await post("evaluation", { subject, resource, action: { name: r.action }, context })) as {
      decision?: unknown;
    };
    if (typeof json.decision !== "boolean") throw new PdpUnavailableError("PDP returned a malformed decision");
    return json.decision;
  }

  async function doSearch(action: string): Promise<string[]> {
    const json = (await post("search/resource", {
      subject,
      resource: { type: "linear:team" },
      action: { name: action },
      context,
    })) as { results?: { id?: unknown }[] };
    if (!Array.isArray(json.results)) throw new PdpUnavailableError("PDP returned a malformed search result");
    return json.results.map((r) => {
      if (typeof r.id !== "string") throw new PdpUnavailableError("PDP returned a malformed search result");
      return r.id;
    });
  }

  return {
    /** Allowed only when every request is allowed. */
    async evaluateAll(reqs: AuthzenRequest[]): Promise<boolean> {
      if (reqs.length === 0) return false;
      return (await Promise.all(reqs.map(evaluate))).every(Boolean);
    },
    /** Team ids the grant permits `action` on. */
    searchTeams(action: string): Promise<string[]> {
      let p = searches.get(action);
      if (!p) {
        p = doSearch(action);
        searches.set(action, p);
      }
      return p;
    },
  };
}
