/*
 * 参戦記録のバックアップ・引き継ぎ（ブラウザの API に依存しない部分）。
 * - ファイル: JSON（人が読める形）
 * - 引き継ぎコード: "LM1." + JSON を base64url にしたもの（LINE やメモで別の端末に貼り付ける用）
 */

/** incompleteBefore：参加イベントが多くて読み切れなかったとき、読めた中でいちばん古い日（これより前は入っていない） */
export type EventernoteLink = { user: string; ids: number[]; syncedAt: string; incompleteBefore?: string };
export type AttendanceData = { manual: Record<string, boolean>; eventernote?: EventernoteLink };

type BackupV1 = {
  app: "lovely-memory";
  kind: "attendance";
  version: 1;
  exportedAt: string;
  /** 手で付けた印（eventernote の内容より優先） */
  attended: number[];
  /** 手で外した印（eventernote にはあるが行かなかったもの） */
  notAttended: number[];
  eventernote?: EventernoteLink;
};

const CODE_PREFIX = "LM1.";

export function toBackup(data: AttendanceData, now = new Date()): BackupV1 {
  const ids = (v: boolean) =>
    Object.entries(data.manual)
      .filter(([, x]) => x === v)
      .map(([k]) => Number(k))
      .sort((a, b) => a - b);
  return {
    app: "lovely-memory",
    kind: "attendance",
    version: 1,
    exportedAt: now.toISOString(),
    attended: ids(true),
    notAttended: ids(false),
    ...(data.eventernote ? { eventernote: data.eventernote } : {}),
  };
}

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function toCode(data: AttendanceData, now = new Date()): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify(toBackup(data, now)));
}

export class BackupError extends Error {}

const isIdList = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => Number.isInteger(x));

/** ファイルの中身、または引き継ぎコードを読み取る（前後の空白や改行は無視） */
export function parseBackup(text: string): AttendanceData {
  const t = text.trim();
  let raw: unknown;
  try {
    raw = JSON.parse(t.startsWith(CODE_PREFIX) ? fromBase64Url(t.slice(CODE_PREFIX.length).replace(/\s+/g, "")) : t);
  } catch {
    throw new BackupError("読み取れませんでした。コードを最後までコピーできているか確認してください");
  }
  const b = raw as Partial<BackupV1>;
  if (b?.app !== "lovely-memory" || b.kind !== "attendance") throw new BackupError("ラブリィメモリーの参戦記録ではありません");
  if (b.version !== 1) throw new BackupError("このバージョンの参戦記録には対応していません。ページを再読み込みしてから試してください");
  if (!isIdList(b.attended) || !isIdList(b.notAttended)) throw new BackupError("参戦記録の形式が正しくありません");

  const manual: Record<string, boolean> = {};
  for (const id of b.notAttended) manual[id] = false;
  for (const id of b.attended) manual[id] = true;
  const en = b.eventernote;
  const eventernote =
    en && typeof en.user === "string" && isIdList(en.ids) && typeof en.syncedAt === "string"
      ? {
          user: en.user,
          ids: en.ids,
          syncedAt: en.syncedAt,
          ...(typeof en.incompleteBefore === "string" && { incompleteBefore: en.incompleteBefore }),
        }
      : undefined;
  return { manual, eventernote };
}

/**
 * 読み込んだ記録を今の記録に反映する。
 * - replace: そっくり置き換える
 * - merge: 手の印は両方を合わせ、同じイベントは読み込んだ側を優先。eventernote 連携は今のものが無いときだけ引き継ぐ
 */
export function applyBackup(current: AttendanceData, incoming: AttendanceData, mode: "merge" | "replace"): AttendanceData {
  if (mode === "replace") return incoming;
  return {
    manual: { ...current.manual, ...incoming.manual },
    eventernote: current.eventernote ?? incoming.eventernote,
  };
}

/** 記録に含まれるイベントの数（手の印 ＋ eventernote、手で外したものを除く） */
export function countAttended(data: AttendanceData): number {
  const ids = new Set(data.eventernote?.ids ?? []);
  for (const [k, v] of Object.entries(data.manual)) {
    if (v) ids.add(Number(k));
    else ids.delete(Number(k));
  }
  return ids.size;
}
