import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { config } from "../src/config.ts";

const b64url = (b: Buffer) => b.toString("base64url");

function openBrowser(url: string, noBrowser: boolean): void {
  if (noBrowser) return;
  const [cmd, ...rest] =
    process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", '""'] : ["xdg-open"];
  const child = spawn(cmd!, [...rest, url], { stdio: "ignore", detached: true });
  child.on("error", (err) => console.warn(`Could not open a browser (${err.message}); open the URL manually.`));
  child.unref();
}

/** Waits for the redirect on an ephemeral loopback port and resolves with the authorization code. */
function listenForCode(state: string): { redirectUri: Promise<string>; code: Promise<string> } {
  let resolveUri!: (u: string) => void;
  const redirectUri = new Promise<string>((r) => (resolveUri = r));
  const code = new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const ok = !error && url.searchParams.get("state") === state && url.searchParams.has("code");
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html" });
      res.end(
        `<body style="font:16px system-ui;text-align:center;margin-top:20vh">${ok ? "Signed in. You can close this tab." : "Sign-in failed."}</body>`,
      );
      server.close();
      if (ok) resolve(url.searchParams.get("code")!);
      else reject(new Error(error ? `${error}: ${url.searchParams.get("error_description")}` : "state mismatch"));
    });
    server.listen(0, "127.0.0.1", () => {
      resolveUri(`http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for sign-in"));
    }, 5 * 60_000).unref();
  });
  return { redirectUri, code };
}

export interface LoginOptions {
  user: string;
  clientId: string;
  /** Scopes requested in addition to openid and profile. */
  scopes: string[];
  noBrowser?: boolean;
}

/** Authorization code + PKCE with a loopback redirect. */
export async function login(opts: LoginOptions): Promise<{ accessToken: string; idToken: string }> {
  const { user, clientId, scopes, noBrowser = false } = opts;
  const oidc = (await (await fetch(`${config.authgearEndpoint}/.well-known/openid-configuration`)).json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
  };
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const listener = listenForCode(state);
  const redirectUri = await listener.redirectUri;

  const authorize = new URL(oidc.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ["openid", "profile", ...scopes].join(" "),
    resource: config.resourceUri,
    state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "login", // so --all can switch users in the same browser
  }).toString();

  console.log(`\nSign in as ${user} (password Demo1234!):\n  ${authorize}`);
  openBrowser(authorize.href, noBrowser);

  const res = await fetch(oidc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: await listener.code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: config.resourceUri,
    }),
  });
  const body = (await res.json()) as { access_token?: string; id_token?: string; error_description?: string };
  if (!res.ok || !body.access_token || !body.id_token) {
    throw new Error(`Token request failed: ${body.error_description ?? res.status}`);
  }
  return { accessToken: body.access_token, idToken: body.id_token };
}

