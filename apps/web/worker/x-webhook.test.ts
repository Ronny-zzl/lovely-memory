import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "./api.ts";
import type { D1 } from "./errors.ts";
import { crcResponse, isSetlistLike, parseEvent } from "./x-webhook.ts";

const SECRET = "test-secret";
const URL_ = "https://lovely-memory.moe/api/x-webhook";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("base64")}`;

function fakeDb() {
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  const db: D1 = { prepare: (sql) => ({ bind: (...values) => ({ run: async () => void runs.push({ sql, values }) }) }) };
  return { db, runs };
}

const event = (text: string, eventType = "post.create") =>
  JSON.stringify({ data: { event_type: eventType, filter: { user_id: "1" }, payload: { id: "100", author_id: "1", text } } });

const env = (db?: D1) => ({ DB: db, X_WEBHOOK_SECRET: SECRET, GITHUB_DISPATCH_TOKEN: "gh", GITHUB_REPOSITORY: "o/r" });
const post = (body: string, signature: string | null, db?: D1) =>
  handleApi(
    new Request(URL_, { method: "POST", body, headers: signature ? { "x-twitter-webhooks-signature-oauth2": signature } : {} }),
    env(db),
  );

afterEach(() => vi.unstubAllGlobals());

describe("x-webhook", () => {
  it("answers the CRC challenge with an HMAC of the token", async () => {
    const res = await handleApi(new Request(`${URL_}?crc_token=abc`), env());
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ response_token: `sha256=${createHmac("sha256", SECRET).update("abc").digest("base64")}` });
    expect((await crcResponse(SECRET, "abc")).response_token).toMatch(/^sha256=/);
  });

  it("is disabled without the secret", async () => {
    expect((await handleApi(new Request(`${URL_}?crc_token=abc`), {}))!.status).toBe(503);
  });

  it("rejects posts with a wrong or missing signature", async () => {
    const body = event("セトリ📣\nM1_ もしも");
    expect((await post(body, null))!.status).toBe(401);
    expect((await post(body, sign(body + " ")))!.status).toBe(401);
  });

  it("dispatches the workflow for setlist-like posts and records every event", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return new Response(null, { status: 204 });
    });
    const { db, runs } = fakeDb();
    const setlist = event("#ﾆｷﾌﾟﾚ セトリ📣\n\nM1_ 宣言前夜");
    expect((await post(setlist, sign(setlist), db))!.status).toBe(200);
    const other = event("本日もありがとうございました！");
    expect((await post(other, sign(other), db))!.status).toBe(200);

    expect(calls).toEqual([
      {
        url: "https://api.github.com/repos/o/r/actions/workflows/watch-x.yml/dispatches",
        body: JSON.stringify({ ref: "main" }),
      },
    ]);
    expect(runs.filter((r) => r.sql.startsWith("INSERT")).map((r) => r.values[4])).toEqual(["ok", "skip"]);
  });

  it("reads the event envelope and recognizes setlist posts and continuations", () => {
    const e = parseEvent(JSON.parse(event("M9_ ラブリィフェリス")))!;
    expect(e).toEqual({ eventType: "post.create", postId: "100", authorId: "1", text: "M9_ ラブリィフェリス" });
    expect(isSetlistLike(e)).toBe(true);
    expect(isSetlistLike(parseEvent(JSON.parse(event("セトリ", "post.delete")))!)).toBe(false);
    expect(parseEvent({ nope: 1 })).toBeUndefined();
  });
});
