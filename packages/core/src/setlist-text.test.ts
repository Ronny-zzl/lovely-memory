import { describe, expect, it } from "vitest";
import { parseSetlistText, splitTags } from "./setlist-text.ts";

const DEBUT = `【☀️セットリスト🌙】
太陽と踊れ月夜に唄え
Second Season Debut LIVE

M1_トキメキいちもんめ！
作詞・作曲：カジ　編曲：tonerico

M4_ 未来絵 Go Around!!(新曲)
作詞・作曲：カジ　編曲：tonerico

M5_ あぃまい大作戦
作詞・作曲：カジ　編曲：tonerico

M8_宣言前夜
作詞：中村彼方
作曲・編曲：XIΛN // Kentoshan

M11_ 君宛て紙ヒコーキ
作詞：じゃすみん
作曲・編曲：パリで食べたカマボコ
`;

const MULTI_STAGE = `#クロフェス2026 セトリ💫

【エメラルドステージ】

M1_ ラブリィフェリス(新曲)
作詞・作曲・編曲：夢魅たぴ

M2_ ライブアンドシーク
作詞・作曲・編曲：Medansy

【オニキスステージ】

M1_ はなうらNIGHT!
作詞・作曲・編曲：佐々木喫茶

M2_ 未来絵 Go Around!!(新曲)
作詞・作曲：カジ　編曲：tonerico
`;

describe("splitTags", () => {
  it("separates trailing parenthesized tags", () => {
    expect(splitTags("未来絵 Go Around!!(新曲)")).toEqual({ title: "未来絵 Go Around!!", tags: ["新曲"] });
    expect(splitTags("もしも（short ver.）(新曲)")).toEqual({ title: "もしも", tags: ["short ver.", "新曲"] });
    expect(splitTags("(not a tag)")).toEqual({ title: "(not a tag)", tags: [] });
  });
});

describe("parseSetlistText", () => {
  it("parses a single-stage setlist and ignores the leading header", () => {
    const stages = parseSetlistText(DEBUT);
    expect(stages).toHaveLength(1);
    expect(stages[0]!.name).toBeUndefined();
    expect(stages[0]!.items.map((i) => i.title)).toEqual([
      "トキメキいちもんめ！",
      "未来絵 Go Around!!",
      "あぃまい大作戦",
      "宣言前夜",
      "君宛て紙ヒコーキ",
    ]);
    expect(stages[0]!.items[1]!.tags).toEqual(["新曲"]);
  });

  it("collects multi-line credits", () => {
    const item = parseSetlistText(DEBUT)[0]!.items[3]!;
    expect(item.credits).toEqual({ lyrics: "中村彼方", music: "XIΛN // Kentoshan", arrangement: "XIΛN // Kentoshan" });
    const kimiate = parseSetlistText(DEBUT)[0]!.items[4]!;
    expect(kimiate.credits).toEqual({ lyrics: "じゃすみん", music: "パリで食べたカマボコ", arrangement: "パリで食べたカマボコ" });
  });

  it("splits stages when numbering restarts and names them by the preceding header", () => {
    const stages = parseSetlistText(MULTI_STAGE);
    expect(stages.map((s) => s.name)).toEqual(["エメラルドステージ", "オニキスステージ"]);
    expect(stages.map((s) => s.items.map((i) => i.title))).toEqual([
      ["ラブリィフェリス", "ライブアンドシーク"],
      ["はなうらNIGHT!", "未来絵 Go Around!!"],
    ]);
  });

  it("keeps text after a stage header as the stage note", () => {
    const stages = parseSetlistText(
      "「ラブリィフェリス」発売記念イベント セトリ⭐️\n\n【1部】もえちゃん考案セトリ❤️\n\nM1_ もしも\n\n【2部】\n\nM1_ オトワ",
    );
    expect(stages.map((s) => [s.name, s.note])).toEqual([
      ["1部", "もえちゃん考案セトリ❤️"],
      ["2部", undefined],
    ]);
  });

  it("reads an unnumbered list of titles", () => {
    const text = `☀️単独公演「LOVEが目印♡」 セトリ🌙

LOVEが目印(新曲)
Oh!MAMA!GOD?
<MC>
はなうら NIGHT!
-EN-
スプらっしゃい！

 #太陽月夜`;
    const stages = parseSetlistText(text);
    expect(stages).toHaveLength(1);
    expect(stages[0]!.items.map((i) => [i.title, i.encore])).toEqual([
      ["LOVEが目印", false],
      ["Oh!MAMA!GOD?", false],
      ["はなうら NIGHT!", false],
      ["スプらっしゃい！", true],
    ]);
  });

  it("recognizes encore lines without restarting the stage", () => {
    const stages = parseSetlistText("M1_ もしも\nM2_ オトワ\nEN_ スプらっしゃい！\nEN2_ トランジション");
    expect(stages).toHaveLength(1);
    expect(stages[0]!.items.map((i) => [i.title, i.encore])).toEqual([
      ["もしも", false],
      ["オトワ", false],
      ["スプらっしゃい！", true],
      ["トランジション", true],
    ]);
  });

  const encoreFlags = (text: string) =>
    parseSetlistText(text).map((st) => [st.name, st.items.map((i) => `${i.title}${i.encore ? "(EN)" : ""}`)]);

  it.each(["アンコール", "-EN-", "【アンコール】", "ENCORE", "🎵アンコール🎵", "Wアンコール"])(
    "treats a standalone %s line as the encore start in numbered setlists",
    (marker) => {
      expect(encoreFlags(`M1_ もしも\nM2_ オトワ\n${marker}\nM3_ スプらっしゃい！`)).toEqual([
        [undefined, ["もしも", "オトワ", "スプらっしゃい！(EN)"]],
      ]);
    },
  );

  it("resets the encore at the next stage and keeps 【アンコール】 out of stage names", () => {
    expect(encoreFlags("【1部】\nM1_ もしも\n【アンコール】\nM2_ オトワ\n【2部】\nM1_ スプらっしゃい！")).toEqual([
      ["1部", ["もしも", "オトワ(EN)"]],
      ["2部", ["スプらっしゃい！"]],
    ]);
  });

  it("reads W encore lines", () => {
    expect(encoreFlags("M1_ もしも\nEN1_ オトワ\nWEN_ スプらっしゃい！")).toEqual([
      [undefined, ["もしも", "オトワ(EN)", "スプらっしゃい！(EN)"]],
    ]);
  });

  it("keeps unknown numbered-looking lines as items instead of dropping them", () => {
    expect(encoreFlags("M1_ もしも\nXX1_ オトワ")).toEqual([[undefined, ["もしも", "XX1_ オトワ"]]]);
  });

  it.each(["【アンコール】", "🎵アンコール🎵", "ENCORE"])("treats %s as the encore start in unnumbered setlists", (marker) => {
    expect(encoreFlags(`セトリ\nもしも\nオトワ\n${marker}\nスプらっしゃい！`)).toEqual([
      [undefined, ["もしも", "オトワ", "スプらっしゃい！(EN)"]],
    ]);
  });
});
