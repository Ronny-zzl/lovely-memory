import { useRef, useState } from "react";
import { applyBackup, BackupError, countAttended, parseBackup, toBackup, toCode, type AttendanceData } from "../attendance-backup.ts";
import { useAttendance } from "../attendance.ts";

/** 参戦記録のバックアップ（ファイル）と、別の端末への引き継ぎ（コード） */
export function AttendanceBackup() {
  const attendance = useAttendance();
  const current = attendance.data;
  const currentCount = countAttended(current);
  const empty = currentCount === 0 && !current.eventernote && Object.keys(current.manual).length === 0;

  const [code, setCode] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<AttendanceData>();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const saveFile = () => {
    const blob = new Blob([JSON.stringify(toBackup(current), null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lovely-memory-参戦記録-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyCode = async () => {
    const c = toCode(current);
    setCode(c);
    try {
      await navigator.clipboard.writeText(c);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピーできない環境では、下に出したコードを手で選択してもらう
    }
  };

  const read = (text: string) => {
    setMessage(undefined);
    try {
      setPending(parseBackup(text));
    } catch (e) {
      setPending(undefined);
      setMessage({ kind: "error", text: e instanceof BackupError ? e.message : "読み取れませんでした" });
    }
  };

  const apply = (mode: "merge" | "replace") => {
    if (!pending) return;
    const next = applyBackup(current, pending, mode);
    attendance.replaceAll(next);
    setPending(undefined);
    setInput("");
    setMessage({ kind: "ok", text: `読み込みました（参戦 ${countAttended(next)} 公演）` });
  };

  return (
    <details className="attend-backup">
      <summary className="section-heading">バックアップ・引き継ぎ</summary>
      <p className="muted small">
        参戦記録はこのブラウザにだけ保存されています。機種変更や別の端末で見るときは、ここから書き出して、移した先で読み込んでください。
      </p>

      <div className="backup-block">
        <h4 className="neighbor-heading">書き出す</h4>
        <div className="backup-actions">
          <button type="button" className="share-button" onClick={() => void copyCode()} disabled={empty}>
            {copied ? "コピーしました" : "引き継ぎコードをコピー"}
          </button>
          <button type="button" className="share-button" onClick={saveFile} disabled={empty}>
            ファイルに保存
          </button>
        </div>
        {empty && <p className="muted small">まだ記録がありません。</p>}
        {code && (
          <textarea className="backup-code" readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} aria-label="引き継ぎコード" />
        )}
        <p className="muted small">コードは LINE やメモに貼り付けて、別の端末に送れます。</p>
      </div>

      <div className="backup-block">
        <h4 className="neighbor-heading">読み込む</h4>
        <textarea
          className="backup-code"
          rows={3}
          value={input}
          placeholder="引き継ぎコード（LM1. で始まる文字列）を貼り付け"
          aria-label="引き継ぎコードを貼り付け"
          onChange={(e) => {
            setInput(e.target.value);
            setPending(undefined);
            setMessage(undefined);
          }}
        />
        <div className="backup-actions">
          <button type="button" className="share-button" disabled={!input.trim()} onClick={() => read(input)}>
            コードから読み込む
          </button>
          <button type="button" className="share-button" onClick={() => fileRef.current?.click()}>
            ファイルを選ぶ
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.txt"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              // 選んだ後にファイルが消された・読み取りを許可されていない、などで読めないこともある
              if (file) {
                file.text().then(read, () => setMessage({ kind: "error", text: "ファイルを読み込めませんでした" }));
              }
            }}
          />
        </div>

        {pending && (
          <div className="backup-confirm" role="group" aria-label="読み込む内容の確認">
            <p className="small">
              参戦 <strong>{countAttended(pending)}</strong> 公演の記録
              {pending.eventernote && `（eventernote: ${pending.eventernote.user}）`}
              {empty ? "を読み込みます。" : `があります。今の記録（参戦 ${currentCount} 公演）とどうしますか？`}
            </p>
            <div className="backup-actions">
              {empty ? (
                <button type="button" className="share-button primary" onClick={() => apply("replace")}>
                  この記録を読み込む
                </button>
              ) : (
                <>
                  <button type="button" className="share-button primary" onClick={() => apply("merge")}>
                    今の記録と合わせる
                  </button>
                  <button type="button" className="share-button" onClick={() => apply("replace")}>
                    置き換える
                  </button>
                </>
              )}
              <button type="button" className="share-button" onClick={() => setPending(undefined)}>
                やめる
              </button>
            </div>
          </div>
        )}
        {message && <p className={`small ${message.kind === "error" ? "error" : "ok"}`}>{message.text}</p>}
      </div>
    </details>
  );
}
