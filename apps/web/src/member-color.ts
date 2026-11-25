/*
 * メンバーカラーの表示。白に近い色（Mi'Line Hearts の中島 怜など）は明るい背景の上で見えないので、
 * 点には濃い縁を付け、線（カードの上の帯・出演率の棒）は灰色にする。
 */
import type { CSSProperties } from "react";
import { isLightColor } from "@lovely-memory/core/runtime";

/** メンバーの色の点（.dot）の style */
export function dotStyle(color: string): CSSProperties {
  return isLightColor(color) ? { background: color, boxShadow: "var(--shadow-dot-light)" } : { background: color };
}

/** 線や枠に使うメンバーの色（白に近い色は灰色に） */
export function lineColor(color: string): string {
  return isLightColor(color) ? "var(--muted)" : color;
}
