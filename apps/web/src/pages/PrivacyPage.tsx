import { PlainPage } from "../components/PlainPage.tsx";
import "./PrivacyPage.css";

const REPO = "https://github.com/Ronny-zzl/lovely-memory";

/**
 * プライバシーポリシー。サイトが実際に扱っているもの（参戦記録は localStorage だけ・エラーの報告・eventernote の読み込み・
 * YouTube の埋め込み・プレビュー版の Google ログイン）を書く。扱い方を変えたら、ここも直す
 */
export function PrivacyPage() {
  return (
    <PlainPage title="プライバシーポリシー" className="privacy">
      <p>
        ラブリィメモリー（以下「このサイト」）は、ファンが個人で運営している非公式のサイトです。このサイトで扱う情報と、その扱い方を説明します。
      </p>

      <section>
        <h2 className="section-heading">参戦記録などの記録</h2>
        <p>
          参戦記録、eventernote
          のユーザー名、表示の設定（ライト・ダーク）などは、お使いのブラウザの中（localStorage）にだけ保存され、このサイトのサーバーには送られません。消したいときは、ブラウザでこのサイトのデータを削除してください。
        </p>
      </section>

      <section>
        <h2 className="section-heading">eventernote からの読み込み</h2>
        <p>
          参戦記録を eventernote から読み込むときは、入力したユーザー名をこのサイトのサーバーに送り、サーバーが eventernote
          の公開されているページから参加したイベントを読み取ります。同じ読み込みを繰り返さないよう結果を 10
          分ほど一時的に保存するほかは、ユーザー名や結果を記録しません。
        </p>
      </section>

      <section>
        <h2 className="section-heading">エラーの報告</h2>
        <p>
          サイトの不具合を直すため、ブラウザでエラーが起きたときに、エラーの内容・起きたページ・サイトのバージョン・ブラウザの種類（User-Agent）をサーバーに送って記録します。参戦記録などは含みません。記録は
          90 日で削除します。
        </p>
      </section>

      <section>
        <h2 className="section-heading">動画の埋め込み</h2>
        <p>
          曲のページの動画は、再生ボタンを押すまで YouTube から何も読み込みません。押すと
          YouTube（youtube-nocookie.com）のプレーヤーを読み込みます。そこでの情報の扱いは
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google のプライバシーポリシー
          </a>
          によります。
        </p>
      </section>

      <section>
        <h2 className="section-heading">アクセス解析・広告</h2>
        <p>
          アクセス解析のツールや広告は使っていません。サイトは Cloudflare で配信しており、通信の処理のために Cloudflare がアクセスの情報（IP
          アドレスなど）を扱います。
        </p>
      </section>

      <section>
        <h2 className="section-heading">プレビュー版（招待した人だけ）</h2>
        <p>
          セトリを入力するためのプレビュー版は、招待した人だけが Google アカウントでログインして使えます。ログインには Cloudflare Access
          を使い、受け取るのはメールアドレスだけです。メールアドレスは、招待した人かどうかの確認と、招待した人の一覧の管理だけに使います。
        </p>
      </section>

      <section>
        <h2 className="section-heading">お問い合わせ</h2>
        <p>
          このページの内容についての質問は、
          <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
            GitHub の Issue
          </a>
          でお知らせください。
        </p>
      </section>

      <p className="muted small">2026 年 11 月 26 日 制定</p>
    </PlainPage>
  );
}
