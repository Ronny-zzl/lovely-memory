import { describe, expect, it } from "vitest";
import { isLightColor } from "./format.ts";

describe("isLightColor", () => {
  it("is true only for near-white member colours", () => {
    expect(isLightColor("#FFFFFF")).toBe(true);
    expect(isLightColor("#fffbe6")).toBe(true);
    // 太陽月夜・Mi'Line Hearts の他のメンバーカラーは縁なしで見える
    for (const c of ["#F5B5C8", "#8BD67A", "#5CC8F0", "#F7A6C9", "#8FD3F5", "#E60033"]) expect(isLightColor(c)).toBe(false);
    expect(isLightColor("not a colour")).toBe(false);
  });
});
