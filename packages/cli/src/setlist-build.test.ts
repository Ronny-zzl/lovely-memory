import { describe, expect, it } from "vitest";
import { IGNORED_TAGS } from "./setlist-build.ts";

describe("IGNORED_TAGS", () => {
  it("drops tags that are not worth recording", () => {
    for (const t of ["新曲", "初披露", "初披露曲", "NEW", "動画撮影可能曲", "撮影OK", "撮影可", "動画撮影OK曲"])
      expect(IGNORED_TAGS.test(t)).toBe(true);
    for (const t of ["short ver.", "アカペラ", "撮影禁止"]) expect(IGNORED_TAGS.test(t)).toBe(false);
  });
});
