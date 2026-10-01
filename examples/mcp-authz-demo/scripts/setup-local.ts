import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from "yaml";

const { values: flags } = parseArgs({
  options: { config: { type: "string" }, secrets: { type: "string" }, env: { type: "string" } },
});
const configPath = resolve(flags.config ?? process.env.AUTHGEAR_CONFIG ?? "../../var/authgear.yaml");
const secretsPath = resolve(flags.secrets ?? process.env.AUTHGEAR_SECRETS ?? "../../var/authgear.secrets.yaml");
const envPath = resolve(flags.env ?? ".env");
const snippetPath = resolve(import.meta.dirname, "../authgear.yaml.snippet");
const PDP_CLIENT_ID = "acme-docs-pdp";
const backupDir = resolve(import.meta.dirname, "../.backup");
mkdirSync(backupDir, { recursive: true });

function load(path: string): Document {
  if (!existsSync(path)) {
    throw new Error(`${path} not found. Run \`authgear init\` (see CONTRIBUTING.md) or pass --config/--secrets.`);
  }
  const doc = parseDocument(readFileSync(path, "utf8"));
  if (doc.errors.length) throw new Error(`${path}: ${doc.errors[0]!.message}`);
  return doc;
}

// Back up (once per run) and write, only when something changed.
function save(path: string, doc: Document, changed: boolean): void {
  if (!changed) return;
  copyFileSync(path, resolve(backupDir, `${basename(path)}.bak`));
  writeFileSync(path, doc.toString({ indentSeq: false }));
}

const asObjects = (doc: Document, path: string[]): Record<string, unknown>[] =>
  (doc.getIn(path, true) as { toJS?: (d: Document) => unknown } | undefined)?.toJS?.(doc) as Record<string, unknown>[] ?? [];

// --- authgear.yaml ---
const snippet = load(snippetPath);
const cfg = load(configPath);
const added: string[] = [];

const hasKey = (path: string[], field: string, value: unknown) => asObjects(cfg, path).some((x) => x[field] === value);

function ensureSeq(path: string[], defaults: unknown[]): void {
  const node = cfg.getIn(path, true);
  if (node === undefined) cfg.setIn(path, cfg.createNode(defaults));
  else if (!isSeq(node)) throw new Error(`${configPath}: ${path.join(".")} must be a list`);
}
ensureSeq(["identity", "login_id", "keys"], [{ key: "email", type: "email" }]);
ensureSeq(["oauth", "clients"], []);

for (const item of (snippet.getIn(["identity", "login_id", "keys"]) as { items: YAMLMap[] }).items) {
  const key = item.get("key");
  if (!hasKey(["identity", "login_id", "keys"], "key", key)) {
    cfg.addIn(["identity", "login_id", "keys"], item);
    added.push(`login ID key ${key}`);
  }
}
for (const item of (snippet.getIn(["oauth", "clients"]) as { items: YAMLMap[] }).items) {
  const id = item.get("client_id");
  if (!hasKey(["oauth", "clients"], "client_id", id)) {
    cfg.addIn(["oauth", "clients"], item);
    added.push(`client ${id}`);
  }
}
save(configPath, cfg, added.length > 0);

// --- authgear.secrets.yaml ---
const sec = load(secretsPath);
const secretItems = sec.get("secrets");
if (!isSeq(secretItems)) throw new Error(`${secretsPath}: missing top-level "secrets" list`);
const findSecret = (key: string): YAMLMap | undefined =>
  secretItems.items.find((s): s is YAMLMap => isMap(s) && s.get("key") === key);

let secretsChanged = false;
let pdpSecret: string | undefined;
const clientSecrets = findSecret("oauth.client_secrets");
const existing = asObjects(sec, ["secrets"])
  .find((s) => s.key === "oauth.client_secrets")
  ?.data as { items?: { client_id: string; keys?: { k?: string }[] }[] } | undefined;
const k = existing?.items?.find((i) => i.client_id === PDP_CLIENT_ID)?.keys?.[0]?.k;

if (k) {
  pdpSecret = Buffer.from(k, "base64url").toString("utf8"); // recover the plain value for .env
} else {
  pdpSecret = randomBytes(24).toString("hex");
  const item = sec.createNode({
    client_id: PDP_CLIENT_ID,
    keys: [
      {
        created_at: Math.floor(Date.now() / 1000),
        k: Buffer.from(pdpSecret).toString("base64url"),
        kid: PDP_CLIENT_ID,
        kty: "oct",
      },
    ],
  });
  if (clientSecrets) {
    if (isSeq(clientSecrets.getIn(["data", "items"]))) clientSecrets.addIn(["data", "items"], item);
    else clientSecrets.setIn(["data", "items"], sec.createNode([item]));
  } else {
    secretItems.add(sec.createNode({ key: "oauth.client_secrets", data: { items: [item] } }));
  }
  secretsChanged = true;
  added.push(`client secret for ${PDP_CLIENT_ID}`);
}
save(secretsPath, sec, secretsChanged);

const adminKey = asObjects(sec, ["secrets"])
  .find((s) => s.key === "admin-api.auth")
  ?.data as { keys?: Record<string, unknown>[] } | undefined;
const jwk = adminKey?.keys?.find((x) => x.kty === "RSA" && x.d);
if (!jwk) throw new Error(`${secretsPath}: no RSA private key in secret "admin-api.auth"`);

// --- .env ---
const wanted: Record<string, string> = {
  PDP_CLIENT_SECRET: pdpSecret,
  ADMIN_API_KEY_ID: String(jwk.kid),
  ADMIN_API_PRIVATE_KEY_JWK: `'${JSON.stringify(jwk)}'`,
};
const envBefore = existsSync(envPath) ? readFileSync(envPath, "utf8") : undefined;
let envText = envBefore ?? readFileSync(resolve(import.meta.dirname, "../.env.example"), "utf8");
for (const [name, value] of Object.entries(wanted)) {
  const line = new RegExp(`^${name}=.*$`, "m");
  envText = line.test(envText) ? envText.replace(line, () => `${name}=${value}`) : `${envText.trimEnd()}\n${name}=${value}\n`;
}
if (envText !== envBefore) writeFileSync(envPath, envText, { mode: 0o600 });

console.log(`Config:  ${configPath}\nSecrets: ${secretsPath}\nEnv:     ${envPath}`);
console.log(added.length ? `Added:   ${added.join(", ")}` : "Authgear files already up to date.");
console.log(envText !== envBefore ? ".env updated." : ".env already up to date.");
if (added.length) console.log("\nRestart the Authgear server (make start) so it reloads the config, then run: npm run seed");
