/*
 * ビルド時に作った HTML を、ブラウザで引き継ぐ（hydrate）ための道具。
 * ビルド時の描画と、ブラウザでそれを引き継ぐ最初の描画は、同じ結果にしないといけない。
 * そのため「今日」「参戦記録」「ブラウザの機能」など、ビルド時には分からないものは、引き継いだ後で使う。
 */
import { useSyncExternalStore } from "react";
import { todayJst } from "./format.ts";

const subscribe = () => () => {};

/**
 * 引き継ぎが終わっているか。ビルド時の描画と引き継ぎの最初の描画では false、そのすぐ後に true で描き直す。
 * ブラウザだけで描くとき（開発時など）は最初から true
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** 今日（JST）。ビルド時の HTML と引き継ぎの最初の描画では、ビルドした日 */
export function useToday(): string {
  return useHydrated() ? todayJst() : __BUILD_TODAY__;
}

/** サイトの origin。ビルド時の HTML と引き継ぎの最初の描画では、設定されたサイトの URL */
export function useOrigin(): string {
  return useHydrated() ? location.origin : __SITE_ORIGIN__;
}
