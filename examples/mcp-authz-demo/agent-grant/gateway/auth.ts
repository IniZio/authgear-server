import type { IncomingMessage } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createReplayCache, verifyProof } from "../shared/dpop.ts";

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export const gatewayConfig = {
  port: Number(process.env.GATEWAY_PORT ?? 4200),
  host: process.env.GATEWAY_HOST ?? "0.0.0.0",
  authgearEndpoint: trimSlash(process.env.AUTHGEAR_ENDPOINT ?? "http://localhost:3100"),
  resourceUri: process.env.GATEWAY_RESOURCE_URI ?? "https://linear-gateway.localhost",
  pdpTimeoutMs: Number(process.env.PDP_TIMEOUT_MS ?? 2000),
  linearUrl: process.env.LINEAR_URL ?? "http://localhost:4300/mcp",
  linearApiKey: process.env.LINEAR_API_KEY ?? "linear-demo-key",
  pdpClientId: process.env.GATEWAY_PDP_CLIENT_ID ?? "linear-gateway",
  pdpClientSecret: process.env.GATEWAY_PDP_CLIENT_SECRET ?? "",
};
const issuer = trimSlash(process.env.AUTHGEAR_ISSUER ?? gatewayConfig.authgearEndpoint);
const publicUrl = trimSlash(process.env.GATEWAY_PUBLIC_URL ?? `http://localhost:${gatewayConfig.port}`);
const mcpUrl = `${publicUrl}/mcp`;

const jwks = createRemoteJWKSet(new URL(`${gatewayConfig.authgearEndpoint}/oauth2/jwks`));
const replay = createReplayCache(120);

export class AuthError extends Error {
  readonly status = 401;
  constructor(
    message: string,
    readonly challenge: string,
  ) {
    super(message);
  }
}

const invalidProof = (msg: string) => new AuthError(msg, 'DPoP error="invalid_dpop_proof"');
const invalidToken = (msg: string) => new AuthError(msg, 'DPoP error="invalid_token"');

export interface GrantAuth {
  sub: string;
  actor: string;
  grantId: string;
}

export async function authenticate(req: IncomingMessage): Promise<GrantAuth> {
  const header = req.headers.authorization;
  if (!header) throw new AuthError("Missing Authorization", "DPoP");
  const m = header.match(/^(\S+)\s+(\S+)$/);
  if (!m || m[1]!.toLowerCase() !== "dpop") throw invalidProof("Authorization scheme must be DPoP");
  const token = m[2]!;

  const proof = req.headers.dpop;
  if (typeof proof !== "string" || proof === "") throw invalidProof("Missing DPoP proof");

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, jwks, {
      issuer,
      audience: gatewayConfig.resourceUri,
      algorithms: ["RS256"],
      typ: "at+jwt",
      requiredClaims: ["exp", "sub", "act", "grant_id", "cnf"],
    }));
  } catch (err) {
    throw invalidToken((err as Error).message);
  }

  const actor = (claims.act as { sub?: unknown } | undefined)?.sub;
  const jkt = (claims.cnf as { jkt?: unknown } | undefined)?.jkt;
  if (typeof claims.sub !== "string" || typeof claims.grant_id !== "string") throw invalidToken("Malformed claims");
  if (typeof actor !== "string" || actor === "") throw invalidToken("Missing act.sub");
  if (typeof jkt !== "string" || jkt === "") throw invalidToken("Missing cnf.jkt");

  const result = await verifyProof({
    proof,
    method: req.method ?? "POST",
    url: mcpUrl,
    accessToken: token,
    expectedJkt: jkt,
    replay,
  });
  if (!result.ok) throw invalidProof(result.reason);

  return { sub: claims.sub, actor, grantId: claims.grant_id };
}
