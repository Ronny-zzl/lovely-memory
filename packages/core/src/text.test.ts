import { describe, expect, it } from "vitest";
import { normalizeTitle, parseCredits } from "./text.ts";

describe("normalizeTitle", () => {
  it("absorbs width, case, spaces and decorative symbols", () => {
    expect(normalizeTitle(" あぃまい大作戦")).toBe(normalizeTitle("あぃまい大作戦"));
    expect(normalizeTitle("未来絵 Go Around!!")).toBe(normalizeTitle("未来絵 GO AROUND！！"));
    expect(normalizeTitle("ワンダーランド☆トレジャーツアー★")).toBe(normalizeTitle("ワンダーランドトレジャーツアー"));
  });
});

describe("parseCredits", () => {
  it("parses combined roles separated by full-width space", () => {
    expect(parseCredits("作詞・作曲：カジ　編曲：tonerico")).toEqual({
      lyrics: "カジ",
      music: "カジ",
      arrangement: "tonerico",
    });
  });
  it("parses all-in-one credit", () => {
    expect(parseCredits("作詞・作曲・編曲：Mumei")).toEqual({ lyrics: "Mumei", music: "Mumei", arrangement: "Mumei" });
  });
  it("parses <br> separated credits and names containing slashes", () => {
    expect(parseCredits("作詞：中村彼方<br>作曲・編曲：XIΛN // Kentoshan")).toEqual({
      lyrics: "中村彼方",
      music: "XIΛN // Kentoshan",
      arrangement: "XIΛN // Kentoshan",
    });
  });
  it("keeps first value when a role repeats", () => {
    expect(parseCredits("作詞：渡邊亜希子　作曲・作詞：ラムシーニ")).toEqual({
      lyrics: "渡邊亜希子",
      music: "ラムシーニ",
    });
  });
  it("keeps names with spaces", () => {
    expect(parseCredits("作詞・作曲：渡辺 翔　編曲：eba")).toEqual({ lyrics: "渡辺 翔", music: "渡辺 翔", arrangement: "eba" });
  });
});
