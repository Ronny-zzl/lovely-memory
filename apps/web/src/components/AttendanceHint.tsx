import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useAttendance } from "../attendance.ts";
import "./AttendanceHint.css";

const DISMISS_KEY = "lovely-memory:attendance-hint-dismissed";

/**
 * 公演一覧の上の案内。「参戦」ボタンが何をするのかを伝える。
 * action: 案内に添えるボタン（狭い画面で一覧の「参戦」ボタンを出し入れするもの）。
 * buttonsHidden: 狭い画面で一覧に「参戦」ボタンが出ていない（action で出す）ときは、案内の文もそれに合わせる。
 */
export function AttendanceHint({
  artistId,
  eventIds,
  action,
  buttonsHidden = false,
}: {
  artistId: string;
  eventIds: number[];
  action?: ReactNode;
  buttonsHidden?: boolean;
}) {
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
        <span className="attend-hint-check" aria-hidden="true">
          ✓
        </span>
        参戦 {count} 公演
        <Link to={`/${artistId}/attendance`}>参戦記録を見る →</Link>
        {action}
      </p>
    );
  }
  if (dismissed) return null;
  return (
    <div className="attend-hint" role="note">
      <p>
        {buttonsHidden && <span className="only-narrow">「参戦を記録」を押してから、</span>}行った公演の右の
        <span className="attend-hint-sample">＋ 参戦</span>を押すと、
        <Link to={`/${artistId}/attendance`}>参戦記録</Link>で生で聴いた曲・まだ聴いていない曲がわかります。
        <Link to={`/${artistId}/attendance`}>eventernote から読み込む</Link>こともできます。
        {action && <span className="attend-hint-action">{action}</span>}
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
