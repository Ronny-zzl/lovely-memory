import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtistConfig } from "@lovely-memory/core";
import { fetchSetlistText } from "./post-text.ts";

const artist = { sources: { x: { username: "official", userId: "42" } } } as unknown as ArtistConfig;
const FIRST = {
  id: "100",
  created_at: "2026-11-18T13:55:00.000Z",
  author_id: "42",
  text: "短縮…",
  note_tweet: { text: "セトリ📣\nM1_ 宣言前夜\nM2_ もしも https://t.co/abc" },
};

function stubX(timeline: unknown[]) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    const body = url.includes("/tweets/100") ? { data: FIRST } : { data: timeline, meta: {} };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchSetlistText", () => {
  it("reads the long-post text and joins thread continuations from the official account", async () => {
    const urls = stubX([
      { id: "101", created_at: "2026-11-18T13:56:00.000Z", text: "M3_ ラブリィフェリス" },
      { id: "102", created_at: "2026-11-18T14:05:00.000Z", text: "ありがとうございました！" },
    ]);
    expect(await fetchSetlistText("t", artist, "100")).toBe("セトリ📣\nM1_ 宣言前夜\nM2_ もしも\nM3_ ラブリィフェリス");
    // 続きを探すのは 20 分以内だけ
    expect(urls[1]).toContain("start_time=2026-11-18T13%3A55%3A01.000Z");
    expect(urls[1]).toContain("end_time=2026-11-18T14%3A15%3A00.000Z");
  });

  it("reads only the post itself for other accounts", async () => {
    const urls = stubX([]);
    const other = { ...artist, sources: { x: { username: "o", userId: "7" } } } as unknown as ArtistConfig;
    expect(await fetchSetlistText("t", other, "100")).toBe("セトリ📣\nM1_ 宣言前夜\nM2_ もしも");
    expect(urls).toHaveLength(1);
  });
});
