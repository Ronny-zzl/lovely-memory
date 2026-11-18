import { useSyncExternalStore } from "react";

/** スマホの幅（CSS の @media (width <= 640px) と同じ境目） */
const QUERY = "(width <= 640px)";

const media = typeof matchMedia === "function" ? matchMedia(QUERY) : undefined;

/** 画面がスマホの幅かどうか。回転・ウィンドウの大きさの変更にも追従する */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      media?.addEventListener("change", onChange);
      return () => media?.removeEventListener("change", onChange);
    },
    () => media?.matches ?? false,
  );
}
