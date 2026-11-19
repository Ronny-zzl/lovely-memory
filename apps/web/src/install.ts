/*
 * ホーム画面への追加（PWA のインストール）の状態。
 * beforeinstallprompt は React の描画前に来ることがあるので、main.tsx の最初で読み込んで待ち受ける。
 */
import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export type InstallState =
  /** ブラウザのインストール画面を出せる（Android の Chrome など） */
  | { kind: "prompt"; install: () => Promise<void> }
  /** iPhone・iPad：共有メニューから手で追加してもらう */
  | { kind: "ios" }
  /** すでにホーム画面から開いている・対応していないブラウザ */
  | { kind: "none" };

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

// iPadOS の Safari は Mac として名乗るので、タッチ対応かどうかで見分ける
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

let deferred: InstallPromptEvent | undefined;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// ビルド時の描画では window が無い
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // ブラウザ任せのミニバナーは出さず、ボタンから出す
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = undefined;
    notify();
  });
}

async function install() {
  const e = deferred;
  if (!e) return;
  await e.prompt();
  const { outcome } = await e.userChoice;
  // 同じイベントは一度しか使えない
  deferred = undefined;
  if (outcome === "accepted") installed = true;
  notify();
}

let snapshot: InstallState = { kind: "none" };
function compute(): InstallState {
  const next: InstallState =
    installed || standalone() ? { kind: "none" } : deferred ? { kind: "prompt", install } : isIos() ? { kind: "ios" } : { kind: "none" };
  // useSyncExternalStore のため、変わらないときは同じオブジェクトを返す
  if (next.kind !== snapshot.kind) snapshot = next;
  return snapshot;
}

const none: InstallState = { kind: "none" };

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    compute,
    // ビルド時の HTML（と、それを引き継ぐ最初の描画）ではボタンを出さない
    () => none,
  );
}
