import { useEffect, useState } from "react";
import { PlainPage } from "../components/PlainPage.tsx";
import { useOrigin } from "../hydration.ts";
import "./InvitePage.css";

type State = { kind: "loading" } | { kind: "error"; text: string } | { kind: "ok"; me: string; members: string[] };

async function call(body?: { add: string } | { remove: string }): Promise<{ me: string; members: string[] }> {
  const res = await fetch("/api/access", body ? { method: "POST", body: JSON.stringify(body) } : undefined);
  const data = (await res.json().catch(() => ({}))) as { me?: string; members?: string[]; error?: string };
  if (!res.ok || !data.members) throw new Error(data.error ?? `エラー（${res.status}）`);
  return { me: data.me ?? "", members: data.members };
}

/**
 * プレビュー版への招待（プレビュー版の管理者だけ）。Google アカウントのメールアドレスを足すと、その人がログインして入れるようになる
 * （Cloudflare Access のグループ。worker/access.ts）。足した後、相手に送る文を作る
 */
export function InvitePage() {
  const origin = useOrigin();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [invited, setInvited] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    call().then(
      (r) => setState({ kind: "ok", ...r }),
      (e: Error) => setState({ kind: "error", text: e.message }),
    );
  }, []);

  const run = async (body: { add: string } | { remove: string }) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await call(body);
      setState({ kind: "ok", ...r });
      if ("add" in body) {
        setInvited(body.add.trim().toLowerCase());
        setEmail("");
        setCopied(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const message =
    invited &&
    `ラブリィメモリーのプレビュー版（セトリの入力ができる版）に招待しました。\n${origin}/ を開いて、Google アカウント（${invited}）でログインしてください。`;

  return (
    <PlainPage title="プレビュー版への招待" className="invite">
      <p className="muted small">
        Google
        アカウントのメールアドレスを足すと、その人がこのプレビュー版にログインできるようになります。入れる人はセトリの入力・保存もできます（保存すると公開サイトにも反映されます）。
      </p>
      {state.kind === "loading" && <p className="muted small">読み込み中…</p>}
      {state.kind === "error" && <p className="small error">{state.text}</p>}
      {state.kind === "ok" && (
        <>
          <form
            className="invite-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void run({ add: email });
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="招待する人の Google アカウント"
              aria-label="招待する人の Google アカウントのメールアドレス"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className="share-button primary" disabled={busy || !email.trim()}>
              招待する
            </button>
          </form>
          {error && <p className="small error">{error}</p>}

          {message && (
            <div className="invite-message">
              <p className="small">招待しました。この文を相手に送ってください。</p>
              <textarea
                className="invite-text"
                readOnly
                value={message}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="招待の文"
              />
              <div className="backup-actions">
                <button
                  type="button"
                  className="share-button"
                  onClick={() =>
                    void navigator.clipboard.writeText(message).then(
                      () => setCopied(true),
                      () => setError("コピーできませんでした（上の文を選んでコピーしてください）"),
                    )
                  }
                >
                  {copied ? "コピーしました" : "文をコピー"}
                </button>
              </div>
            </div>
          )}

          <h2 className="section-heading">招待した人（{state.members.length} 人）</h2>
          {state.members.length === 0 ? (
            <p className="muted small">まだいません。</p>
          ) : (
            <ul className="invite-list">
              {state.members.map((m) => (
                <li key={m}>
                  <span className="invite-email">{m}</span>
                  <button
                    type="button"
                    className="share-button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`${m} を外しますか？（ログイン中でもすぐに入れなくなります）`)) void run({ remove: m });
                    }}
                  >
                    外す
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">管理者（{state.me}）は Cloudflare Access のポリシーに直接書いてあるので、ここには出ません。</p>
        </>
      )}
    </PlainPage>
  );
}
