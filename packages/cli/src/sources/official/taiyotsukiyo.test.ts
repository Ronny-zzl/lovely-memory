import { describe, expect, it } from "vitest";
import { parseIndex, parseRelease } from "./taiyotsukiyo";

// 公式サイトの実際の構造を縮約したもの（2026-11 時点）
const RELEASE_HTML = `
<div class="discography-info">
  <div class="meta-block">
    <div class="meta-tag"><span>2nd EP</span></div><div class="meta-date">2024.07.03 RELEASE</div>
  </div>
  <div class="discography-category"><span>太陽と踊れ</span></div>
  <h1 class="discography-title">君宛て紙ヒコーキ</h1>
  <ol class="discography-songs">
    <li><div class="title">プロデューサンライズ</div><div class="text">作詞・作曲・編曲：Medansy</div></li>
    <li><div class="title">GO！サニーカート</div><div class="text">作詞：やぎぬまかな　作曲・編曲：滝澤俊輔(TRYTONELABO)</div></li>
    <li><div class="title">LOVEが目印</div><div class="text">作詞：海野水玉<br />作曲・編曲：萩龍一</div></li>
    <li><div class="title">君宛て紙ヒコーキ(Instrumental)</div></li>
  </ol>
</div>`;

describe("taiyotsukiyo official adapter", () => {
  it("parses a release page", () => {
    const tracks = parseRelease(RELEASE_HTML, "https://taiyotsukiyo.com/discography/taiyo/kimiatehikouki/");
    expect(tracks.map((t) => t.title)).toEqual(["プロデューサンライズ", "GO！サニーカート", "LOVEが目印"]);
    expect(tracks[0]!.release).toEqual({
      date: "2024-07-03",
      title: "君宛て紙ヒコーキ",
      kind: "ep",
      url: "https://taiyotsukiyo.com/discography/taiyo/kimiatehikouki/",
    });
    expect(tracks[0]!.unitLabel).toBe("太陽と踊れ");
    expect(tracks[1]!.credits).toEqual({ lyrics: "やぎぬまかな", music: "滝澤俊輔(TRYTONELABO)", arrangement: "滝澤俊輔(TRYTONELABO)" });
    expect(tracks[2]!.credits).toEqual({ lyrics: "海野水玉", music: "萩龍一", arrangement: "萩龍一" });
  });

  it("collects only release detail links from the index", () => {
    const html = `
      <a href="https://taiyotsukiyo.com/discography/">top</a>
      <a href="https://taiyotsukiyo.com/discography/taiyo/">category</a>
      <a href="https://taiyotsukiyo.com/discography/feed/">feed</a>
      <a href="https://taiyotsukiyo.com/discography/taiyo/kimiatehikouki/">a</a>
      <a href="https://taiyotsukiyo.com/discography/taiyotsukiyo/%E3%83%A9%E3%83%96%E3%83%AA%E3%82%A3%E3%83%95%E3%82%A7%E3%83%AA%E3%82%B9/">b</a>
      <a href="https://example.com/discography/taiyo/x/">other host</a>`;
    expect(parseIndex(html, "https://taiyotsukiyo.com/discography/")).toEqual([
      "https://taiyotsukiyo.com/discography/taiyo/kimiatehikouki/",
      "https://taiyotsukiyo.com/discography/taiyotsukiyo/%E3%83%A9%E3%83%96%E3%83%AA%E3%82%A3%E3%83%95%E3%82%A7%E3%83%AA%E3%82%B9/",
    ]);
  });
});
