import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "./api.ts";

// Access のトークンの確かめ方は edit.test.ts で見ている。ここではヘッダーのメールアドレスをそのまま使う
vi.mock("./edit.ts", async (orig) => ({
  ...(await orig<typeof import("./edit.ts")>()),
  accessEmail: async (request: Request) => request.headers.get("x-test-email") ?? undefined,
}));

const env = {
  ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  ACCESS_AUD: "aud",
  ACCESS_ADMIN_EMAILS: "Owner@example.com, other-admin@example.com",
  CF_API_TOKEN: "t",
  CF_ACCOUNT_ID: "acc",
  ACCESS_GROUP_ID: "g1",
};
const GROUP_URL = "https://api.cloudflare.com/client/v4/accounts/acc/access/groups/g1";
const REVOKE_URL = "https://api.cloudflare.com/client/v4/accounts/acc/access/organizations/revoke_user";

/** Cloudflare の API の代わり。グループを覚えておき、呼ばれた内容を返す */
function stubCloudflare(include: unknown[] = [{ email: { email: "a@example.com" } }], fail?: number) {
  let group = { id: "g1", name: "editors", include, exclude: [], require: [] };
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url, method, body });
    if (fail) return new Response(JSON.stringify({ errors: [{ message: "account acc" }] }), { status: fail });
    if (url === GROUP_URL && method === "PUT") group = { ...group, ...(body as object) };
    return new Response(JSON.stringify({ success: true, result: url === GROUP_URL ? group : {} }));
  });
  return calls;
}

const req = (email: string | undefined, body?: unknown) =>
  handleApi(
    new Request("https://draft.example.pages.dev/api/access", {
      method: body ? "POST" : "GET",
      headers: email ? { "x-test-email": email } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  ) as Promise<Response>;

afterEach(() => vi.unstubAllGlobals());

describe("/api/access", () => {
  it("lists the group for an admin", async () => {
    stubCloudflare();
    const res = await req("owner@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ me: "owner@example.com", members: ["a@example.com"] });
  });

  it("refuses people who are not logged in or not admins, without calling Cloudflare", async () => {
    const calls = stubCloudflare();
    expect((await req(undefined)).status).toBe(401);
    expect((await req("a@example.com")).status).toBe(403);
    expect((await req("a@example.com", { add: "b@example.com" })).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("is not available until configured", async () => {
    stubCloudflare();
    const res = await handleApi(new Request("https://x/api/access"), { ...env, CF_API_TOKEN: undefined });
    expect(res?.status).toBe(503);
  });

  it("adds an email (normalized), keeping other rules", async () => {
    const calls = stubCloudflare([{ email: { email: "a@example.com" } }, { email_domain: { domain: "example.org" } }]);
    const res = await req("owner@example.com", { add: "  B@Example.com " });
    expect(await res.json()).toEqual({ me: "owner@example.com", members: ["a@example.com", "b@example.com"] });
    expect(calls.at(-1)).toEqual({
      url: GROUP_URL,
      method: "PUT",
      body: {
        name: "editors",
        include: [
          { email: { email: "a@example.com" } },
          { email_domain: { domain: "example.org" } },
          { email: { email: "b@example.com" } },
        ],
        exclude: [],
        require: [],
      },
    });
  });

  it("does nothing when adding someone already in the group", async () => {
    const calls = stubCloudflare();
    await req("owner@example.com", { add: "A@example.com" });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("removes an email and revokes their session", async () => {
    const calls = stubCloudflare([{ email: { email: "a@example.com" } }, { email: { email: "b@example.com" } }]);
    const res = await req("owner@example.com", { remove: "a@example.com" });
    expect(await res.json()).toEqual({ me: "owner@example.com", members: ["b@example.com"] });
    expect(calls.at(-1)).toEqual({ url: REVOKE_URL, method: "POST", body: { email: "a@example.com" } });
  });

  it("rejects things that are not email addresses", async () => {
    stubCloudflare();
    expect((await req("owner@example.com", { add: "not an email" })).status).toBe(400);
    expect((await req("owner@example.com", { foo: 1 })).status).toBe(400);
  });

  it("does not pass Cloudflare's error body through", async () => {
    stubCloudflare(undefined, 403);
    const res = await req("owner@example.com");
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("acc");
  });
});

describe("/api/me", () => {
  const me = (email?: string) =>
    handleApi(new Request("https://x/api/me", { headers: email ? { "x-test-email": email } : {} }), env) as Promise<Response>;

  it("returns the logged-in email and whether it is an admin", async () => {
    expect(await (await me("OWNER@example.com")).json()).toEqual({ email: "owner@example.com", admin: true });
    expect(await (await me("a@example.com")).json()).toEqual({ email: "a@example.com", admin: false });
  });

  it("is 401 without a login", async () => {
    expect((await me()).status).toBe(401);
  });
});
