import { useAttendance } from "../attendance.ts";
import { todayJst } from "../format.ts";

/** 公演の「参戦」印。開催前の公演は「参戦予定」 */
export function AttendanceToggle({ eventId, date, compact = false }: { eventId: number; date: string; compact?: boolean }) {
  const attendance = useAttendance();
  const on = attendance.isAttended(eventId);
  const label = date > todayJst() ? "参戦予定" : "参戦";
  const from = attendance.source(eventId) === "eventernote" ? "（eventernote から）" : "";
  return (
    <button
      type="button"
      className={`attend-toggle${on ? " on" : ""}${compact ? " compact" : ""}`}
      aria-pressed={on}
      title={on ? `${label}の印あり${from}。押すと外します` : `${label}の印を付ける`}
      onClick={() => attendance.toggle(eventId)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {on ? (
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
      {!compact && label}
    </button>
  );
}
