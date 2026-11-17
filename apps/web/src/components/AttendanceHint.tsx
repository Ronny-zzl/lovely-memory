import { useState } from "react";
import { Link } from "react-router";
import { useAttendance } from "../attendance.ts";

const DISMISS_KEY = "lovely-memory:attendance-hint-dismissed";

/** 公演一覧の上の案内。「参戦」ボタンが何をするのかを伝える */
export function AttendanceHint({ artistId, eventIds }: { artistId: string; eventIds: number[] }) {
  const attendance = useAttendance();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const count = eventIds.filter((id) => attendance.isAttended(id)).length;

  // 記録があれば、件数と参戦記録へのリンクだけを控えめに出す
  if (count > 0) {
    return (
      <p className="attend-hint compact">
        <span className="attend-hint-check" aria-hidden="true">✓</span>
        参戦 {count} 公演
        <Link to={`/${artistId}/attendance`}>参戦記録を見る →</Link>
      </p>
    );
  }
  if (dismissed) return null;
  return (
    <div className="attend-hint" role="note">
      <p>
        行った公演の右の<span className="attend-hint-sample">＋ 参戦</span>を押すと、
        <Link to={`/${artistId}/attendance`}>参戦記録</Link>で生で聴いた曲・まだ聴いていない曲がわかります。
        <Link to={`/${artistId}/attendance`}>eventernote から読み込む</Link>こともできます。
      </p>
      <button
        type="button"
        className="attend-hint-close"
        aria-label="この案内を閉じる"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // 保存できなくても、この表示中は閉じる
          }
        }}
      >
        ×
      </button>
    </div>
  );
}
