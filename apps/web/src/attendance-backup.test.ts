import { describe, expect, it } from "vitest";
import { applyBackup, BackupError, countAttended, parseBackup, toBackup, toCode, type AttendanceData } from "./attendance-backup.ts";

const data: AttendanceData = {
  manual: { "486948": true, "490206": false },
  eventernote: { user: "日本語ユーザー", ids: [490206, 492966], syncedAt: "2026-11-17T09:00:00.000Z" },
};

describe("backup", () => {
  it("round-trips through the file format and the transfer code", () => {
    const file = JSON.stringify(toBackup(data));
    expect(parseBackup(file)).toEqual(data);
    const code = toCode(data);
    expect(code).toMatch(/^LM1\.[A-Za-z0-9_-]+$/);
    // 改行や前後の空白が混じっても読める（メモアプリ経由など）
    expect(parseBackup(`  ${code.slice(0, 20)}\n${code.slice(20)}\n`)).toEqual(data);
  });

  it("keeps the note that the eventernote import was incomplete", () => {
    const partial: AttendanceData = { manual: {}, eventernote: { ...data.eventernote!, incompleteBefore: "2026-03-21" } };
    expect(parseBackup(JSON.stringify(toBackup(partial)))).toEqual(partial);
  });

  it("rejects other data with a clear message", () => {
    expect(() => parseBackup("LM1.abc")).toThrow(BackupError);
    expect(() => parseBackup(`{"app":"other"}`)).toThrow("ラブリィメモリーの参戦記録ではありません");
    expect(() => parseBackup(JSON.stringify({ ...toBackup(data), version: 2 }))).toThrow("バージョン");
    expect(() => parseBackup(JSON.stringify({ ...toBackup(data), attended: ["x"] }))).toThrow("形式");
  });

  it("merges (incoming wins per event) or replaces", () => {
    const current: AttendanceData = { manual: { "486948": false, "1": true } };
    const incoming = parseBackup(toCode(data));
    expect(applyBackup(current, incoming, "merge")).toEqual({
      manual: { "1": true, "486948": true, "490206": false },
      eventernote: data.eventernote,
    });
    expect(applyBackup(current, incoming, "replace")).toEqual(incoming);
    // 今の eventernote 連携は残す
    const linked: AttendanceData = { manual: {}, eventernote: { user: "me", ids: [], syncedAt: "x" } };
    expect(applyBackup(linked, incoming, "merge").eventernote?.user).toBe("me");
  });

  it("counts attended events (manual marks override eventernote)", () => {
    // 486948（手で付けた）+ 492966（eventernote）。490206 は手で外した
    expect(countAttended(data)).toBe(2);
  });
});
