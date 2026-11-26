import { useEffect, useState } from "react";

/** デプロイ時に書き出す（deploy.yml）。そのサイトがどのコミットから作られたか */
type Version = { sha: string; committedAt: string };

/** これより待っても出ないときは、GitHub Actions を見てもらう */
const SLOW_MS = 5 * 60_000;
/** 確かめる間隔 */
const POLL_MS = 5_000;

/**
 * 入力画面で保存した後、サイトに反映されるまでの様子。
 * 保存を受け付けた時刻（at、サーバーの時計）より後のコミットから作られたサイトが出たら「反映された」とする。
 * 書き込み（apply-edit）のコミットは受け付けの後にできるので、それを含むデプロイが済んだということ。
 */
export function DeployProgress({
  at,
  actions,
  href,
  linkLabel = "イベントのページを見る",
}: {
  at: string;
  actions?: string;
  href: string;
  linkLabel?: string;
}) {
  const since = Date.parse(at);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<number>();

  useEffect(() => {
    if (live) return;
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        const v = (await res.json()) as Version;
        if (!stop && Date.parse(v.committedAt) >= since) setLive(Date.now());
      } catch {
        // まだ無い（手元で動かしているとき）・通信の失敗。次の確認を待つ
      }
    };
    void check();
    const poll = setInterval(() => void check(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [since, live]);

  const elapsed = (t: number) => {
    const s = Math.max(0, Math.round((t - since) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  if (live) {
    return (
      <p className="small deploy-progress done" role="status">
        ✓ サイトに反映されました（{elapsed(live)}）。<a href={href}>{linkLabel}</a>
      </p>
    );
  }
  return (
    <div className="small deploy-progress" role="status">
      <p>
        <span className="deploy-spinner" aria-hidden="true" />
        保存しました。サイトに反映しています…（{elapsed(now)}、ふつう 1〜2 分）
      </p>
      {now - since > SLOW_MS && (
        <p className="error">
          まだ反映されていません。
          {actions ? (
            <a href={actions} target="_blank" rel="noreferrer">
              GitHub の Actions
            </a>
          ) : (
            "GitHub の Actions"
          )}
          で、書き込み（Apply edit）か反映（Deploy）が失敗していないか確かめてください。
        </p>
      )}
    </div>
  );
}
