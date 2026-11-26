import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handleApi } from "./api.ts";
import { resetAccessKeys, verifyAccessJwt } from "./edit.ts";

const TEAM = "https://team.cloudflareaccess.com";
const AUD = "aud-tag";
const URL_ = "https://draft.example.pages.dev/api/edit";
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, GITHUB_DISPATCH_TOKEN: "gh", GITHUB_REPOSITORY: "o/r" };
const PAYLOAD = { artist: "miline-hearts", event: 1, stages: [{ items: [{ song: "初恋の合図" }] }] };

let keys: CryptoKeyPair;
let jwk: JsonWebKey;
let other: CryptoKeyPair;

const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function sign(claims: Record<string, unknown>, key = keys.privateKey, kid = "k1") {
  const h = b64url(JSON.stringify({ alg: "RS256", kid }));
  const p = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}
const valid = (over: Record<string, unknown> = {}) =>
  sign({ aud: [AUD], iss: TEAM, exp: Math.floor(Date.now() / 1000) + 600, email: "me@example.com", ...over });

beforeAll(async () => {
  const alg = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
  other = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
  jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" } as JsonWebKey;
});

/** Access の公開鍵と GitHub の API の代わり。GitHub に送った中身を返す */
function stubFetch() {
  const dispatched: Array<{ url: string; body: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    if (url === `${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }));
    dispatched.push({ url, body: init?.body ?? "" });
    return new Response(null, { status: 204 });
  });
  return dispatched;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetAccessKeys();
});

describe("verifyAccessJwt", () => {
  it("accepts a token signed by Access for this application", async () => {
    stubFetch();
    expect(await verifyAccessJwt(await valid(), TEAM, AUD)).toBe("me@example.com");
  });

  it("rejects wrong audience, issuer, expired and forged tokens", async () => {
    stubFetch();
    expect(await verifyAccessJwt(await valid({ aud: ["other"] }), TEAM, AUD)).toBeUndefined();
    expect(await verifyAccessJwt(await valid({ iss: "https://evil.example" }), TEAM, AUD)).toBeUndefined();
    expect(await verifyAccessJwt(await valid({ exp: Math.floor(Date.now() / 1000) - 10 }), TEAM, AUD)).toBeUndefined();
    const forged = await sign({ aud: [AUD], iss: TEAM, exp: Math.floor(Date.now() / 1000) + 600, email: "x" }, other.privateKey);
    expect(await verifyAccessJwt(forged, TEAM, AUD)).toBeUndefined();
    expect(await verifyAccessJwt("not.a.jwt", TEAM, AUD)).toBeUndefined();
  });
});

describe("POST /api/edit", () => {
  const post = (body: string, token?: string) =>
    handleApi(new Request(URL_, { method: "POST", body, headers: token ? { "cf-access-jwt-assertion": token } : {} }), env);

  it("starts the apply-edit workflow with the setlist", async () => {
    const dispatched = stubFetch();
    const res = await post(JSON.stringify(PAYLOAD), await valid());
    expect(res!.status).toBe(202);
    const body = (await res!.json()) as { at: string; actions: string };
    expect(Date.parse(body.at)).toBeGreaterThan(Date.now() - 60_000);
    expect(body.actions).toBe("https://github.com/o/r/actions");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.url).toBe("https://api.github.com/repos/o/r/actions/workflows/apply-edit.yml/dispatches");
    expect(JSON.parse(dispatched[0]!.body)).toEqual({ ref: "main", inputs: { payload: JSON.stringify(PAYLOAD) } });
  });

  it("refuses requests without a valid Access token (e.g. to the public site)", async () => {
    const dispatched = stubFetch();
    expect((await post(JSON.stringify(PAYLOAD)))!.status).toBe(401);
    expect((await post(JSON.stringify(PAYLOAD), await valid({ aud: ["other"] })))!.status).toBe(401);
    expect(dispatched).toHaveLength(0);
  });

  it("refuses bodies that are not setlists", async () => {
    stubFetch();
    expect((await post("{", await valid()))!.status).toBe(400);
    expect((await post(JSON.stringify({ artist: "x" }), await valid()))!.status).toBe(400);
  });

  it("is disabled when not configured", async () => {
    stubFetch();
    const res = await handleApi(new Request(URL_, { method: "POST", body: "{}" }), {});
    expect(res!.status).toBe(503);
  });
});
