import { createHash, randomUUID } from "node:crypto";
import {
  EmbeddedJWK,
  SignJWT,
  calculateJwkThumbprint,
  compactVerify,
  exportJWK,
  generateKeyPair as joseGenerateKeyPair,
  importJWK,
  type JWK,
} from "jose";

export const DPOP_TYP = "dpop+jwt";
export const DPOP_ALG = "ES256";
export const IAT_SKEW_SECONDS = 60;

const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];

export interface ReplayCache {
  // Returns true if jti is new (and records it); false if seen already.
  checkAndAdd(jti: string, nowSeconds?: number): boolean;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function generateKeyPair(): Promise<{
  privateJwk: JWK;
  publicJwk: JWK;
}> {
  const { privateKey, publicKey } = await joseGenerateKeyPair(DPOP_ALG, {
    extractable: true,
  });
  return {
    privateJwk: await exportJWK(privateKey),
    publicJwk: await exportJWK(publicKey),
  };
}

function publicPart(jwk: JWK): JWK {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

// RFC 7638 thumbprint, base64url.
export async function thumbprint(jwk: JWK): Promise<string> {
  return calculateJwkThumbprint(publicPart(jwk), "sha256");
}

function sha256B64u(s: string): string {
  return createHash("sha256").update(s).digest("base64url");
}

// RFC 9449 §4.2: compare scheme, host and path; ignore query and fragment.
function normalizeHtu(u: string): string | undefined {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export async function createProof(
  privateJwk: JWK,
  htm: string,
  htu: string,
  accessToken?: string,
): Promise<string> {
  const key = await importJWK(privateJwk, DPOP_ALG);
  const payload: Record<string, unknown> = { jti: randomUUID(), htm, htu };
  if (accessToken !== undefined) {
    payload.ath = sha256B64u(accessToken);
  }
  return new SignJWT(payload)
    .setProtectedHeader({
      typ: DPOP_TYP,
      alg: DPOP_ALG,
      jwk: publicPart(privateJwk),
    })
    .setIssuedAt()
    .sign(key);
}

export function createReplayCache(ttlSeconds: number): ReplayCache {
  const seen = new Map<string, number>(); // jti -> expiry (s)
  return {
    checkAndAdd(jti, nowSeconds = Math.floor(Date.now() / 1000)) {
      for (const [k, exp] of seen) {
        if (exp <= nowSeconds) seen.delete(k);
      }
      if (seen.has(jti)) return false;
      seen.set(jti, nowSeconds + ttlSeconds);
      return true;
    },
  };
}

export async function verifyProof(opts: {
  proof: string;
  method: string;
  url: string;
  accessToken?: string;
  expectedJkt: string;
  replay: ReplayCache;
  now?: number; // seconds; for tests
}): Promise<VerifyResult> {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason });
  try {
    const parts = opts.proof.split(".");
    if (parts.length !== 3) return fail("malformed proof");
    const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
    if (header.typ !== DPOP_TYP) return fail("invalid typ");
    if (header.alg !== DPOP_ALG) return fail("unsupported alg");
    const hjwk = header.jwk as JWK | undefined;
    if (!hjwk || typeof hjwk !== "object") return fail("missing jwk");
    for (const m of PRIVATE_JWK_MEMBERS) {
      if (m in hjwk) return fail("jwk contains private key");
    }

    const { payload: raw } = await compactVerify(opts.proof, EmbeddedJWK, {
      algorithms: [DPOP_ALG],
    });
    const payload = JSON.parse(new TextDecoder().decode(raw));

    const { jti, htm, htu, iat, ath } = payload;
    if (typeof jti !== "string" || jti === "") return fail("invalid jti");
    if (typeof htm !== "string") return fail("invalid htm");
    if (typeof htu !== "string") return fail("invalid htu");
    if (typeof iat !== "number") return fail("invalid iat");

    if (htm.toLowerCase() !== opts.method.toLowerCase()) {
      return fail("htm mismatch");
    }
    const a = normalizeHtu(htu);
    const b = normalizeHtu(opts.url);
    if (a === undefined || a !== b) return fail("htu mismatch");

    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - iat) > IAT_SKEW_SECONDS) return fail("iat out of range");

    if (opts.accessToken !== undefined) {
      if (ath !== sha256B64u(opts.accessToken)) return fail("ath mismatch");
    }

    if ((await thumbprint(hjwk)) !== opts.expectedJkt) {
      return fail("jkt mismatch");
    }

    // Last, so a rejected proof does not burn its jti.
    if (!opts.replay.checkAndAdd(jti, now)) return fail("jti replayed");
    return { ok: true };
  } catch (e) {
    return fail(`invalid proof: ${e instanceof Error ? e.message : String(e)}`);
  }
}
