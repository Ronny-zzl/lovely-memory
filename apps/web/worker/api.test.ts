import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// eventernote には実際に読みに行かない
vi.mock("@lovely-memory/eventernote/attended", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lovely-memory/eventernote/attended")>();
  return { ...actual, fetchAttended: vi.fn() };
});

const { AttendedError, fetchAttended } = await import("@lovely-memory/eventernote/attended");
const { handleApi } = await import("./api.ts");
const fetchMock = vi.mocked(fetchAttended);

const get = (path: string, init?: RequestInit) => handleApi(new Request(`https://lovely-memory.moe${path}`, init));
const body = async (res: Response | undefined) => (await res!.json()) as Record<string, unknown>;

const RESULT = { events: [{ id: 492324, date: "2026-11-03" }], pages: 1, truncated: false };

/** Workers の Cache API（caches.default）の代わり */
function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => void store.set(req.url, res)),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleApi", () => {
  it("/api/ 以外は扱わない", async () => {
    expect(await get("/songs")).toBeUndefined();
    expect(await get("/apix/eventernote/a")).toBeUndefined();
  });

  it("GET 以外は 405", async () => {
    const res = await get("/api/eventernote/Ronny62?since=2026-01-01", { method: "POST" });
    expect(res!.status).toBe(405);
  });

  it("知らない API は 404", async () => {
    expect((await get("/api/unknown"))!.status).toBe(404);
    expect((await get("/api/eventernote/a/b?since=2026-01-01"))!.status).toBe(404);
  });

  it("ユーザー名・since の形式が違えば 400（eventernote には読みに行かない）", async () => {
    for (const path of [
      "/api/eventernote/bad%20name?since=2026-01-01",
      "/api/eventernote/Ronny62",
      "/api/eventernote/Ronny62?since=2026-1-1",
    ]) {
      const res = await get(path);
      expect(res!.status, path).toBe(400);
      expect(await body(res), path).toHaveProperty("error");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("読み込めたら結果を返し、キャッシュしてよいと伝える", async () => {
    fetchMock.mockResolvedValue(RESULT);
    const res = await get("/api/eventernote/Ronny62/?since=2026-09-04");
    expect(res!.status).toBe(200);
    expect(res!.headers.get("cache-control")).toBe("public, max-age=600");
    expect(await body(res)).toEqual({ user: "Ronny62", ...RESULT });
    expect(fetchMock).toHaveBeenCalledWith("Ronny62", expect.objectContaining({ since: "2026-09-04" }));
  });

  it("同じユーザー（大文字小文字を問わない）・同じ since はキャッシュから返す", async () => {
    const cache = fakeCache();
    vi.stubGlobal("caches", { default: cache });
    fetchMock.mockResolvedValue(RESULT);

    expect((await get("/api/eventernote/Ronny62?since=2026-09-04"))!.status).toBe(200);
    const again = await get("/api/eventernote/ronny62?since=2026-09-04");
    expect(await body(again)).toEqual({ user: "Ronny62", ...RESULT });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await get("/api/eventernote/Ronny62?since=2026-10-01");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("eventernote のエラーを HTTP ステータスに置き換える（エラーはキャッシュしない）", async () => {
    const cache = fakeCache();
    vi.stubGlobal("caches", { default: cache });
    const cases = [
      [new AttendedError("invalid", "invalid"), 400],
      [new AttendedError("not-found", "見つかりません"), 404],
      [new AttendedError("upstream", "HTTP 503"), 502],
      [new Error("network"), 502],
    ] as const;
    for (const [error, status] of cases) {
      fetchMock.mockRejectedValueOnce(error);
      const res = await get("/api/eventernote/Ronny62?since=2026-09-04");
      expect(res!.status, error.message).toBe(status);
      expect(res!.headers.get("cache-control")).toBe("no-store");
      expect(await body(res)).toHaveProperty("error");
    }
    expect(cache.put).not.toHaveBeenCalled();
  });
});
