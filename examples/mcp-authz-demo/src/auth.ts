import type { IncomingMessage } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "./config.ts";

const jwks = createRemoteJWKSet(new URL(`${config.authgearEndpoint}/oauth2/jwks`));

export const resourceMetadataUrl = `${config.publicUrl}/.well-known/oauth-protected-resource`;

export class AuthError extends Error {
  constructor(
    message: string,
    /** WWW-Authenticate header value. */
    readonly challenge: string,
    readonly status = 401,
  ) {
    super(message);
  }
}

export const bearerChallenge = (params: Record<string, string> = {}) =>
  `Bearer ${Object.entries({ ...params, resource_metadata: resourceMetadataUrl })
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ")}`;

/** 403 asking the client to re-authorize with more scope (MCP step-up). */
export const insufficientScope = (scope: string) =>
  new AuthError(`Missing scope ${scope}`, bearerChallenge({ error: "insufficient_scope", scope }), 403);

export async function authenticate(req: IncomingMessage): Promise<AuthInfo> {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AuthError("Missing bearer token", bearerChallenge());

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.authgearEndpoint,
      audience: config.resourceUri,
      algorithms: ["RS256"],
    });
    if (!payload.sub) throw new Error("token has no sub");
    const scope = typeof payload.scope === "string" ? payload.scope : "";
    return {
      token,
      clientId: String(payload.client_id ?? ""),
      scopes: scope.split(/\s+/).filter(Boolean),
      expiresAt: payload.exp,
      resource: new URL(config.resourceUri),
      extra: { sub: payload.sub },
    };
  } catch (err) {
    console.warn(`[auth] rejected token: ${(err as Error).message}`);
    throw new AuthError("Invalid token", bearerChallenge({ error: "invalid_token" }));
  }
}

const labels = new Map<string, { label: string; until: number }>();

/** Human-readable name for the console and denial messages; falls back to the user ID. */
export async function userLabel(auth: AuthInfo): Promise<string> {
  const sub = String(auth.extra?.sub);
  const cached = labels.get(sub);
  if (cached && cached.until > Date.now()) return cached.label;

  let label = sub;
  try {
    const res = await fetch(`${config.authgearEndpoint}/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const info = (await res.json()) as Record<string, string | undefined>;
      label = info.preferred_username ?? info.email ?? sub;
    }
  } catch (err) {
    console.warn(`[auth] userinfo failed: ${(err as Error).message}`);
  }
  labels.set(sub, { label, until: Date.now() + 5 * 60_000 });
  return label;
}
