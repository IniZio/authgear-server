// Loads .env (if present) and exposes typed settings shared by server and scripts.
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return v;
}

const port = Number(env("PORT", "4100"));

export const config = {
  port,
  /** Where MCP clients reach this server. */
  publicUrl: trimSlash(env("PUBLIC_URL", `http://localhost:${port}`)),
  authgearEndpoint: trimSlash(env("AUTHGEAR_ENDPOINT", "http://localhost:3100")),
  /** The Authgear Resource URI; tokens must carry it in `aud`. */
  resourceUri: env("RESOURCE_URI", "https://docs.acme.localhost"),
  appId: env("APP_ID", "accounts"),
  portalUrl: trimSlash(env("PORTAL_URL", "http://localhost:8000")),
  pdpTimeoutMs: Number(env("PDP_TIMEOUT_MS", "2000")),
};

export const pdpCredentials = () => ({
  clientId: env("PDP_CLIENT_ID", "acme-docs-pdp"),
  clientSecret: env("PDP_CLIENT_SECRET"),
});
