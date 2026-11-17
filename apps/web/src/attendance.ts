/*
 * 参戦記録。このブラウザの localStorage にだけ保存する（サーバーには送らない）。
 * - manual: 手で付けた／外した印（eventernote から読み込んだ内容より優先）
 * - eventernote: eventernote の「参加イベント」から読み込んだイベント ID
 * イベント ID は eventernote の ID なので、アーティストをまたいで一意。
 */
import { useSyncExternalStore } from "react";

const KEY = "lovely-memory:attendance:v1";

export type EventernoteLink = { user: string; ids: number[]; syncedAt: string };
type Stored = { manual: Record<string, boolean>; eventernote?: EventernoteLink };

const EMPTY: Stored = { manual: {} };

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<Stored>;
    return { manual: v.manual ?? {}, eventernote: v.eventernote };
  } catch {
    return EMPTY;
  }
}

let state: Stored = read();
const listeners = new Set<() => void>();

function write(next: Stored) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できない環境（プライベートブラウズなど）でも、開いている間は使えるようにする
  }
  listeners.forEach((l) => l());
}

// 別のタブでの変更を反映する
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  state = read();
  listeners.forEach((l) => l());
});

export type Attendance = {
  eventernote?: EventernoteLink;
  isAttended(eventId: number): boolean;
  /** 印の出どころ（eventernote から読み込んだものを手で外した場合も "manual"） */
  source(eventId: number): "manual" | "eventernote" | undefined;
  toggle(eventId: number): void;
  setEventernote(link: EventernoteLink | undefined): void;
  /** 手で付けた・外した印をすべて消す */
  clearManual(): void;
};

function build(s: Stored): Attendance {
  const imported = new Set(s.eventernote?.ids ?? []);
  const isAttended = (id: number) => s.manual[id] ?? imported.has(id);
  return {
    eventernote: s.eventernote,
    isAttended,
    source: (id) => (id in s.manual ? "manual" : imported.has(id) ? "eventernote" : undefined),
    toggle(id) {
      const next = !isAttended(id);
      const manual = { ...state.manual };
      // eventernote の内容と同じに戻るなら、手の印は消す（再読み込みの結果に従うように）
      if (next === imported.has(id)) delete manual[id];
      else manual[id] = next;
      write({ ...state, manual });
    },
    setEventernote(link) {
      write({ ...state, eventernote: link });
    },
    clearManual() {
      write({ ...state, manual: {} });
    },
  };
}

let snapshot: { from: Stored; value: Attendance } | undefined;
function getSnapshot(): Attendance {
  if (snapshot?.from !== state) snapshot = { from: state, value: build(state) };
  return snapshot.value;
}

export function useAttendance(): Attendance {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getSnapshot);
}

/** eventernote の参加イベントを読み込む（サイトの API 経由） */
export async function fetchEventernote(user: string, since: string): Promise<EventernoteLink> {
  const res = await fetch(`/api/eventernote/${encodeURIComponent(user)}?since=${since}`);
  const body = (await res.json().catch(() => ({}))) as { error?: string; user?: string; events?: Array<{ id: number }> };
  if (!res.ok || !body.events) throw new Error(body.error ?? `読み込みに失敗しました（HTTP ${res.status}）`);
  return { user: body.user ?? user, ids: body.events.map((e) => e.id), syncedAt: new Date().toISOString() };
}
