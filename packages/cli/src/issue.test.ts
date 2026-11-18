import { describe, expect, it } from "vitest";
import { buildMarker, parseComment, parseMarker } from "./issue.ts";

describe("issue marker", () => {
  it("round-trips artist and event", () => {
    const marker = buildMarker({ artistId: "taiyotsukiyo-2nd", eventId: 496443 });
    expect(parseMarker(`${marker}\n**2026-11-18**`)).toEqual({ artistId: "taiyotsukiyo-2nd", eventId: 496443 });
    expect(parseMarker("no marker here")).toBeUndefined();
  });
});

describe("parseComment", () => {
  it("extracts directives and the post URL, leaving the setlist text", () => {
    const c = parseComment(
      ["https://twitter.com/taiyototsukiyo/status/2119427196028874863?s=20", "☀️単独公演 セトリ🌙", "M1_ もしも", "/add-unknown"].join(
        "\n",
      ),
    );
    expect(c).toEqual({
      skip: false,
      addUnknown: true,
      source: "https://x.com/taiyototsukiyo/status/2119427196028874863",
      text: "☀️単独公演 セトリ🌙\nM1_ もしも",
    });
  });

  it("recognizes /skip", () => {
    expect(parseComment("/skip").skip).toBe(true);
    // 文中の /skip は指示ではない
    expect(parseComment("M1_ a/skip").skip).toBe(false);
  });
});
