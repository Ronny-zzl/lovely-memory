import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "./api.ts";
import type { D1 } from "./errors.ts";

const ORIGIN = "https://lovely-memory.moe";

function fakeDb() {
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  const db: D1 = {
    prepare: (sql) => ({ bind: (...values) => ({ run: async () => void runs.push({ sql, values }) }) }),
  };
  return { db, runs };
}

const post = (body: string, { origin = ORIGIN, db }: { origin?: string | null; db?: D1 } = {}) =>
  handleApi(
    new Request(`${ORIGIN}/api/errors`, {
      method: "POST",
      body,
      headers: { ...(origin ? { origin } : {}), "user-agent": "Mozilla/5.0 (iPhone) Version/26.1 Safari/605.1.15" },
    }),
    { DB: db },
  );

const REPORT = {
  kind: "error",
  message: "TypeError: x is undefined",
  stack: "TypeError: x\n    at f (/assets/a.js:1:2)",
  path: "/a/songs",
  build: "abc1234",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/errors", () => {
  it("記録して 204 を返す", async () => {
    const { db, runs } = fakeDb();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = await post(JSON.stringify(REPORT), { db });
    expect(res!.status).toBe(204);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sql).toMatch(/^INSERT INTO client_errors/);
    expect(runs[0]!.values).toEqual(["error", REPORT.message, REPORT.stack, "/a/songs", "abc1234", expect.stringContaining("iPhone")]);
  });

  it("ほかのサイトから・Origin 無しで送られたものは受け付けない", async () => {
    const { db, runs } = fakeDb();
    expect((await post(JSON.stringify(REPORT), { origin: "https://example.com", db }))!.status).toBe(403);
    expect((await post(JSON.stringify(REPORT), { origin: null, db }))!.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  it("形がおかしいもの・大きすぎるものは受け付けない", async () => {
    const { db, runs } = fakeDb();
    for (const body of ["not json", "{}", JSON.stringify({ ...REPORT, kind: "other" }), JSON.stringify({ ...REPORT, message: "" })]) {
      expect((await post(body, { db }))!.status, body).toBe(400);
    }
    expect((await post(JSON.stringify({ ...REPORT, stack: "x".repeat(9000) }), { db }))!.status).toBe(413);
    expect(runs).toHaveLength(0);
  });

  it("長い項目は切り詰める", async () => {
    const { db, runs } = fakeDb();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await post(JSON.stringify({ ...REPORT, message: "m".repeat(800), path: "/" + "p".repeat(400) }), { db });
    const [, message, , path] = runs[0]!.values as string[];
    expect(message).toHaveLength(500);
    expect(path).toHaveLength(300);
  });

  it("ときどき古い記録を消す", async () => {
    const { db, runs } = fakeDb();
    vi.spyOn(Math, "random").mockReturnValue(0.001);
    await post(JSON.stringify(REPORT), { db });
    expect(runs.map((r) => r.sql.split(" ")[0])).toEqual(["INSERT", "DELETE"]);
  });

  it("D1 が無い（開発時）ときは記録せずに 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post(JSON.stringify(REPORT)))!.status).toBe(204);
    expect(warn).toHaveBeenCalled();
  });

  it("POST 以外は 405", async () => {
    expect((await handleApi(new Request(`${ORIGIN}/api/errors`)))!.status).toBe(405);
  });
});
