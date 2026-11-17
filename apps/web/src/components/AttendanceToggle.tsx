import { useState } from "react";
import { useAttendance } from "../attendance.ts";
import { todayJst } from "../format.ts";

/**
 * 公演の「参戦」印のボタン。開催前の公演は「予定」。
 * variant="row" は一覧の行の右端、"detail" は公演ページ（説明文付き）。
 */
export function AttendanceToggle({ eventId, date, variant = "row" }: { eventId: number; date: string; variant?: "row" | "detail" }) {
  const attendance = useAttendance();
  const [pop, setPop] = useState(false);
  const on = attendance.isAttended(eventId);
  const future = date > todayJst();
  const word = future ? "予定" : "参戦";
  const fromEventernote = attendance.source(eventId) === "eventernote";
  const action = on ? `${word}の印を外す` : future ? "参戦予定にする" : "参戦した公演に印を付ける";

  const button = (
    <button
      type="button"
      className={`attend-toggle${on ? " on" : ""}${pop ? " pop" : ""}`}
      aria-pressed={on}
      aria-label={action}
      title={`${action}${on && fromEventernote ? "（eventernote から読み込んだ印）" : ""}`}
      onClick={() => {
        attendance.toggle(eventId);
        setPop(!on);
      }}
      onAnimationEnd={() => setPop(false)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {on ? (
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
      <span className="attend-label">
        {variant === "detail" ? (on ? (future ? "参戦予定" : "参戦した") : future ? "参戦予定にする" : "参戦した") : word}
      </span>
    </button>
  );

  if (variant === "row") return button;
  return (
    <div className="attend-detail">
      {button}
      <span className="muted small">
        {on
          ? fromEventernote
            ? "eventernote から読み込んだ印です。"
            : "参戦記録に入っています。"
          : "印を付けると、参戦記録で生で聴いた曲がわかります。"}
      </span>
    </div>
  );
}
