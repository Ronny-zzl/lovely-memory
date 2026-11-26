import { describe, expect, it } from "vitest";
import { needsPublicDeploy } from "./site-changes.ts";

describe("needsPublicDeploy", () => {
  const drafts = ["miline-hearts"];
  it("下書きのグループのデータだけなら要らない", () => {
    expect(needsPublicDeploy(["artists/miline-hearts/setlists/1.yaml", "artists/miline-hearts/songs.json"], drafts).deploy).toBe(false);
  });
  it("ほかのグループ・コード・設定が変わっていれば要る", () => {
    expect(needsPublicDeploy(["artists/miline-hearts/songs.json", "artists/taiyotsukiyo-2nd/songs.json"], drafts).deploy).toBe(true);
    expect(needsPublicDeploy(["apps/web/src/main.tsx"], drafts).deploy).toBe(true);
    // 名前が前方一致するだけの別のディレクトリは下書きではない
    expect(needsPublicDeploy(["artists/miline-hearts-2/songs.json"], drafts).deploy).toBe(true);
  });
  it("分からないときは要る。変更が無ければ要らない", () => {
    expect(needsPublicDeploy(undefined, drafts).deploy).toBe(true);
    expect(needsPublicDeploy([], drafts).deploy).toBe(false);
  });
});
