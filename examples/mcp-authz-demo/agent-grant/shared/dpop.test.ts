import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT, importJWK } from "jose";
import {
  createProof,
  createReplayCache,
  generateKeyPair,
  thumbprint,
  verifyProof,
} from "./dpop.ts";

const URL_ = "https://gw.example/mcp";
const TOKEN = "access-token-123";

async function setup() {
  const kp = await generateKeyPair();
  return { ...kp, jkt: await thumbprint(kp.publicJwk) };
}

test("round-trip verifies, query/fragment ignored", async () => {
  const { privateJwk, jkt } = await setup();
  const proof = await createProof(privateJwk, "POST", URL_, TOKEN);
  const r = await verifyProof({
    proof,
    method: "POST",
    url: URL_ + "?a=1#x",
    accessToken: TOKEN,
    expectedJkt: jkt,
    replay: createReplayCache(120),
  });
  assert.deepEqual(r, { ok: true });
});

test("round-trip without access token", async () => {
  const { privateJwk, jkt } = await setup();
  const proof = await createProof(privateJwk, "POST", URL_);
  const r = await verifyProof({
    proof,
    method: "POST",
    url: URL_,
    expectedJkt: jkt,
    replay: createReplayCache(120),
  });
  assert.equal(r.ok, true);
});

test("fails: htm, htu, ath, jkt", async () => {
  const { privateJwk, jkt } = await setup();
  const other = await setup();
  const base = { accessToken: TOKEN, expectedJkt: jkt };
  const mk = () => createProof(privateJwk, "POST", URL_, TOKEN);
  const cases: [string, Parameters<typeof verifyProof>[0]][] = [
    ["htm", { ...base, proof: await mk(), method: "GET", url: URL_, replay: createReplayCache(120) }],
    ["htu", { ...base, proof: await mk(), method: "POST", url: "https://gw.example/other", replay: createReplayCache(120) }],
    ["ath", { ...base, accessToken: "wrong", proof: await mk(), method: "POST", url: URL_, replay: createReplayCache(120) }],
    ["jkt", { ...base, expectedJkt: other.jkt, proof: await mk(), method: "POST", url: URL_, replay: createReplayCache(120) }],
  ];
  for (const [name, args] of cases) {
    const r = await verifyProof(args);
    assert.equal(r.ok, false, name);
    if (!r.ok) assert.match(r.reason, new RegExp(name), name);
  }
});

test("fails: iat outside +-60s", async () => {
  const { privateJwk, jkt } = await setup();
  const now = Math.floor(Date.now() / 1000);
  for (const offset of [-61, 61]) {
    const proof = await createProof(privateJwk, "POST", URL_, TOKEN);
    const r = await verifyProof({
      proof, method: "POST", url: URL_, accessToken: TOKEN, expectedJkt: jkt,
      replay: createReplayCache(120), now: now + offset,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /iat/);
  }
  const ok = await verifyProof({
    proof: await createProof(privateJwk, "POST", URL_, TOKEN),
    method: "POST", url: URL_, accessToken: TOKEN, expectedJkt: jkt,
    replay: createReplayCache(120), now: now + 30,
  });
  assert.equal(ok.ok, true);
});

test("fails: reused jti", async () => {
  const { privateJwk, jkt } = await setup();
  const replay = createReplayCache(120);
  const proof = await createProof(privateJwk, "POST", URL_, TOKEN);
  const args = { proof, method: "POST", url: URL_, accessToken: TOKEN, expectedJkt: jkt, replay };
  assert.equal((await verifyProof(args)).ok, true);
  const r = await verifyProof(args);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /replay/);
});

test("fails: wrong typ, jwk with private member", async () => {
  const { privateJwk, publicJwk, jkt } = await setup();
  const key = await importJWK(privateJwk, "ES256");
  const mk = (typ: string, jwk: object) =>
    new SignJWT({ jti: "j" + Math.random(), htm: "POST", htu: URL_ })
      .setProtectedHeader({ typ, alg: "ES256", jwk })
      .setIssuedAt()
      .sign(key);
  for (const proof of [
    await mk("JWT", publicJwk),
    await mk("dpop+jwt", privateJwk),
  ]) {
    const r = await verifyProof({
      proof, method: "POST", url: URL_, expectedJkt: jkt, replay: createReplayCache(120),
    });
    assert.equal(r.ok, false);
  }
});

test("fails: tampered signature", async () => {
  const { privateJwk, jkt } = await setup();
  const proof = await createProof(privateJwk, "POST", URL_);
  const [h, p] = proof.split(".");
  const r = await verifyProof({
    proof: `${h}.${p}.${"A".repeat(86)}`, method: "POST", url: URL_,
    expectedJkt: jkt, replay: createReplayCache(120),
  });
  assert.equal(r.ok, false);
});

test("thumbprint matches RFC 7638 example-style stability", async () => {
  const { privateJwk, publicJwk } = await setup();
  assert.equal(await thumbprint(privateJwk), await thumbprint(publicJwk));
});
