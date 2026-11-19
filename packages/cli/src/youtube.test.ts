import { describe, expect, it } from "vitest";
import { Song } from "@lovely-memory/core";
import { liveDateAndLabel, mvLabel, planVideos, songsInTitle, videoKind } from "./youtube.ts";

const song = (id: string, title: string, extra: Partial<Song> = {}) => Song.parse({ id, title, ...extra });

describe("videoKind", () => {
  it.each([
    ["太陽と踊れ月夜に唄え「ラブリィフェリス」Music Video", "mv"],
    ["太陽と踊れ月夜に唄え「あぃまい大作戦」Music Video Sakura Edition🌸", "mv"],
    ["【ライブ映像】太陽と踊れ月夜に唄え「もしも」(2025.07.27 2nd ANNIVERSARY LIVE)", "live"],
    ["太陽と踊れ「JUNK GAME POP」LIVE VIDEO(2023.12.3 1st ONEMAN BAND LIVE)", "live"],
    ["【Dance Practice】太陽と踊れ月夜に唄え「NON理論」", "dance"],
    ["太陽と踊れ月夜に唄え「ラブリィフェリス」【歌割動画】", "parts"],
    ["月夜に唄え「colorless」【歌い分け試聴】", "parts"],
  ])("%s → %s", (title, kind) => {
    expect(videoKind(title)).toBe(kind);
  });

  it.each([
    "太陽と踊れ月夜に唄え『ラブリィフェリス』 MV Making Video",
    "【MV Teaser】太陽と踊れ月夜に唄え「ラブリィフェリス」",
    "太陽と踊れ月夜に唄え「オトワ」TV Spot",
    "幾望／「月夜に唄え」課題曲",
    "「太陽と踊れ」「月夜に唄え」2ndEP試聴動画",
    "【メイキング映像】太陽と踊れ月夜に唄え Second Season Debut LIVE～ふたつの空の下で～",
    "【たいつき】究極の選択ゲーム！メンバーは究極の二択どちらを選ぶ？",
  ])("載せない: %s", (title) => {
    expect(videoKind(title)).toBeNull();
  });
});

describe("liveDateAndLabel", () => {
  it("公演日と公演名（全角括弧・空白 2 つ・月日 1 桁も）", () => {
    expect(liveDateAndLabel("【ライブ映像】太陽と踊れ月夜に唄え「ラブリィフェリス」(2026.09.04  Second Season Debut LIVE)")).toEqual({
      date: "2026-09-04",
      label: "Second Season Debut LIVE",
    });
    expect(liveDateAndLabel("月夜に唄え「colorless」Live Video (2023.9.13 Taiban Live Vol.1)")).toEqual({
      date: "2023-09-13",
      label: "Taiban Live Vol.1",
    });
    expect(liveDateAndLabel("【ライブ映像】「トキメキいちもんめ！」（2025.04.19 新体制お披露目公演）")?.label).toBe("新体制お披露目公演");
  });

  it("日付が無ければ undefined", () => {
    expect(liveDateAndLabel("【ライブ映像】太陽と踊れ月夜に唄え「もしも」")).toBeUndefined();
  });
});

describe("mvLabel", () => {
  it("Music Video の後ろの別バージョン名（絵文字は除く）", () => {
    expect(mvLabel("太陽と踊れ月夜に唄え「あぃまい大作戦」Music Video Sakura Edition🌸")).toBe("Sakura Edition");
    expect(mvLabel("太陽と踊れ月夜に唄え「ラブリィフェリス」Music Video")).toBeUndefined();
  });
});

describe("songsInTitle", () => {
  const songs = [
    song("s001", "愛 make CRAZY world"),
    song("s002", "はなうらNIGHT!", { aliases: ["はなうらナイト"] }),
    song("s003", "もしも"),
  ];

  it("かぎ括弧の中を表記ゆれ・空白を無視して照合", () => {
    expect(songsInTitle("月夜に唄え「愛 make CRAZY world 」Music Video", songs).map((s) => s.id)).toEqual(["s001"]);
    expect(songsInTitle("太陽と踊れ『はなうらナイト』Teaser", songs).map((s) => s.id)).toEqual(["s002"]);
  });

  it("グループ名のかぎ括弧（「太陽と踊れ」）は曲にならない", () => {
    expect(songsInTitle("「太陽と踊れ」「月夜に唄え」2ndEP試聴動画", songs)).toEqual([]);
  });
});

describe("planVideos", () => {
  it("登録済みは飛ばし、曲の決まらないものは unmatched に", () => {
    const songs = [song("s001", "もしも", { videos: [{ id: "sBS3o0-zrRo", kind: "mv", date: "2025-07-16" }] }), song("s002", "幾望")];
    const plan = planVideos(
      [
        { id: "sBS3o0-zrRo", title: "太陽と踊れ月夜に唄え「もしも」Music Video" },
        { id: "mXqkkMy9aSo", title: "【ライブ映像】太陽と踊れ月夜に唄え「もしも」(2025.07.27 2nd ANNIVERSARY LIVE)" },
        { id: "RRr4yEfFdiM", title: "月夜に唄え「幾望」Music Video" },
        { id: "M0vfVA8mDg4", title: "月夜に唄え「幾望」Teaser" },
        { id: "OAvuyx-5Tu0", title: "太陽と踊れ月夜に唄え「今しかできない音楽を」LIVE VIDEO(2023.12.3 1st ONEMAN BAND LIVE)" },
      ],
      songs,
    );
    expect(plan.additions.map((a) => [a.song.id, a.video.id, a.kind, a.date, a.label])).toEqual([
      ["s001", "mXqkkMy9aSo", "live", "2025-07-27", "2nd ANNIVERSARY LIVE"],
      ["s002", "RRr4yEfFdiM", "mv", undefined, undefined],
    ]);
    expect(plan.unmatched.map((u) => u.video.id)).toEqual(["OAvuyx-5Tu0"]);
  });
});
