import { describe, expect, it } from "vitest";
import { displayTitle, isLightColor } from "./format.ts";

describe("isLightColor", () => {
  it("is true only for near-white member colours", () => {
    expect(isLightColor("#FFFFFF")).toBe(true);
    expect(isLightColor("#fffbe6")).toBe(true);
    // 太陽月夜・Mi'Line Hearts の他のメンバーカラーは縁なしで見える
    for (const c of ["#F5B5C8", "#8BD67A", "#5CC8F0", "#F7A6C9", "#8FD3F5", "#E60033"]) expect(isLightColor(c)).toBe(false);
    expect(isLightColor("not a colour")).toBe(false);
  });
});

describe("displayTitle", () => {
  it("drops the group name at the start, unless it is part of the title", () => {
    expect(displayTitle("太陽と踊れ月夜に唄え TAIBAN LIVE「日進月歩」vol.16", "太陽と踊れ月夜に唄え")).toBe(
      "TAIBAN LIVE「日進月歩」vol.16",
    );
    expect(displayTitle("太陽と踊れ月夜に唄え単独公演「LOVEが目印♡」", "太陽と踊れ月夜に唄え")).toBe("単独公演「LOVEが目印♡」");
    const box = "Mi'Line Hearts Presents　\"Mi'Line BOX vol.1\"〜何度だって待ち合わせしよう〜";
    expect(displayTitle(box, "Mi'Line Hearts")).toBe(box);
    expect(displayTitle("Mi'Line Hearts主催ライブ", "Mi'Line Hearts")).toBe("Mi'Line Hearts主催ライブ");
    // 合同のイベント（「× 相手」で始まってしまう）
    const joint = "前橋ウィッチーズ × LINKL PLANET 昼公演「ミラクル魔女修行！」";
    expect(displayTitle(joint, "前橋ウィッチーズ")).toBe(joint);
    expect(displayTitle("前橋ウィッチーズ x ARCANA PROJECT", "前橋ウィッチーズ")).toBe("前橋ウィッチーズ x ARCANA PROJECT");
    expect(displayTitle("前橋ウィッチーズ xmas ライブ", "前橋ウィッチーズ")).toBe("xmas ライブ");
  });
});
