import { deleteWebhook, listSubscriptions, listWebhooks, registerWebhook, revalidateWebhook } from "../x-api.ts";

/**
 * X の Webhook の登録・確認（最初に 1 回だけ使う）。X_BEARER_TOKEN 環境変数が必要。
 *
 *   pnpm lm x-webhook list                    登録済みの Webhook と購読を表示
 *   pnpm lm x-webhook register --url <url>    登録（X がすぐに CRC で確かめに来るので、先にサイトへ X_WEBHOOK_SECRET を設定しておく）
 *   pnpm lm x-webhook revalidate --id <id>    CRC をやり直す（無効になったとき）
 *   pnpm lm x-webhook delete --id <id>
 *
 * 登録したら、表示された id をリポジトリの Actions の変数 X_WEBHOOK_ID に設定する。
 */
export async function xWebhook(action: string, opts: Record<string, unknown>) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN 環境変数が必要です");
  const id = typeof opts.id === "string" ? opts.id : undefined;

  if (action === "list") {
    for (const w of await listWebhooks(token)) console.log(`webhook ${w.id}  ${w.valid ? "有効" : "無効"}  ${w.url}`);
    for (const s of await listSubscriptions(token)) {
      console.log(
        `subscription ${s.subscription_id}  ${s.event_type}  user ${s.filter?.user_id ?? "-"}  webhook ${s.webhook_id ?? "-"}  ${s.tag ?? ""}`,
      );
    }
  } else if (action === "register") {
    if (typeof opts.url !== "string") throw new Error("--url が必要です");
    const w = await registerWebhook(token, opts.url);
    console.log(`登録しました: id ${w.id}（${w.valid ? "有効" : "無効"}）→ Actions の変数 X_WEBHOOK_ID に設定してください`);
  } else if (action === "revalidate" && id) {
    await revalidateWebhook(token, id);
    console.log("CRC をやり直しました");
  } else if (action === "delete" && id) {
    await deleteWebhook(token, id);
    console.log("削除しました");
  } else {
    throw new Error("使い方: x-webhook list | register --url <url> | revalidate --id <id> | delete --id <id>");
  }
}
