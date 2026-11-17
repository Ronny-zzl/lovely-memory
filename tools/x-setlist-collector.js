/*
 * lovely-memory: X セトリ告知コレクター
 *
 * ログイン済みのブラウザで x.com を開き、開発者ツールのコンソールにこのファイルの中身を貼り付けて実行する。
 * （Chrome で初回に貼り付けが拒否されたら、表示に従って「allow pasting」と入力してから貼り直す）
 *
 * - 画面右下のパネルの検索リンクを開き、「自動スクロール」で最後まで読み込ませる
 * - 「続きを読む」で本文が切れているポストは一覧に出るので、タイムライン上でそのポストをクリックして
 *   詳細画面を開けば全文が取り込まれる（ブラウザの戻るで検索結果に戻る）
 * - 集めたデータは localStorage に保存される。ページを再読み込みしたらスクリプトを貼り直せば続きから
 * - 終わったら「JSON を保存」→ pnpm lm import-setlists <artistId> --file <保存した JSON>
 *
 * 画面に表示されたポストを読み取るだけで、X へのリクエストは行わない。
 * X の DOM 構造（data-testid）が変わると動かなくなる可能性がある。
 */
(() => {
  const HANDLE = "taiyototsukiyo";
  const SINCE = "2026-09-04";
  const QUERIES = [
    `(セトリ OR セットリスト OR setlist OR "set list" OR セトリスト)`,
    `(M1 OR M01 OR "M.1")`,
    `(作詞 OR 作曲 OR 編曲)`,
  ];
  /** セトリ告知の可能性があるポストだけ残す（取り込み側でも曲行の有無で再判定する） */
  const KEEP = /^\s*M\s*\d|セトリ|セットリスト|set\s*list|作詞|作曲|編曲/im;
  const STORE = `lovely-memory:tweets:${HANDLE}`;

  if (window.__lovelyMemoryCollector) {
    window.__lovelyMemoryCollector.show();
    return;
  }

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "[]");
    } catch {
      return [];
    }
  };
  const data = new Map(load().map((t) => [t.id, t]));
  let dirty = false;

  /** 同じポストの 2 つの記録のうち良い方（全文 > 長い本文） */
  const better = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    if (a.truncated !== b.truncated) return a.truncated ? b : a;
    return b.text.length > a.text.length ? b : a;
  };
  /** 別タブで集めた分を取り込む（同じ localStorage を共有するため、上書きで消さない） */
  const mergeFromStorage = () => {
    let changed = false;
    for (const t of load()) {
      const cur = data.get(t.id);
      const next = better(cur, t);
      if (next !== cur) {
        data.set(t.id, next);
        changed = true;
      }
    }
    return changed;
  };
  window.addEventListener("storage", (e) => {
    if (e.key === STORE && mergeFromStorage()) render();
  });

  /** 改行と絵文字（img の alt）を保ったまま本文を取り出す */
  const textOf = (node) => {
    let out = "";
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.nodeValue;
      else if (c.nodeName === "IMG") out += c.getAttribute("alt") || "";
      else if (c.nodeName === "BR") out += "\n";
      else if (c.nodeType === Node.ELEMENT_NODE) out += textOf(c);
    }
    return out;
  };

  const scan = () => {
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const timeEl = article.querySelector('a[href*="/status/"] time');
      const href = timeEl?.closest("a")?.getAttribute("href") ?? "";
      const m = href.match(/^\/([^/]+)\/status\/(\d+)/);
      if (!m || m[1].toLowerCase() !== HANDLE.toLowerCase()) continue;
      const textEl = article.querySelector('[data-testid="tweetText"]');
      if (!textEl) continue;
      const text = textOf(textEl).trim();
      if (!KEEP.test(text)) continue;

      const id = m[2];
      const truncated = !!article.querySelector('[data-testid="tweet-text-show-more-link"]');
      const prev = data.get(id);
      if (prev && !prev.truncated && truncated) continue; // 全文を取得済みなら上書きしない
      if (prev && prev.text === text && prev.truncated === truncated) continue;
      data.set(id, {
        id,
        url: `https://x.com/${m[1]}/status/${id}`,
        time: timeEl.getAttribute("datetime"),
        author: m[1],
        text,
        truncated,
      });
      dirty = true;
    }
  };

  // ---------- UI ----------
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:99999;width:340px;max-height:70vh;overflow:auto;" +
    "background:#fff;color:#111;border:1px solid #ccc;border-radius:12px;padding:12px;" +
    "font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)";
  document.body.appendChild(panel);

  const button = (label, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "margin:2px 4px 2px 0;padding:4px 10px;border:1px solid #999;border-radius:6px;background:#f6f6f6;cursor:pointer";
    b.onclick = onClick;
    return b;
  };

  let autoTimer = null;
  let lastHeight = 0;
  let still = 0;
  const toggleAuto = () => {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      render();
      return;
    }
    still = 0;
    autoTimer = setInterval(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
      const h = document.documentElement.scrollHeight;
      still = h === lastHeight ? still + 1 : 0;
      lastHeight = h;
      if (still >= 10) toggleAuto(); // 約 15 秒伸びなければ終端とみなす
    }, 1500);
    render();
  };

  const exportJson = () =>
    JSON.stringify(
      [...data.values()].sort((a, b) => a.time.localeCompare(b.time)),
      null,
      2,
    );

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    a.download = `tweets-${HANDLE}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const render = () => {
    const all = [...data.values()];
    const truncated = all.filter((t) => t.truncated).sort((a, b) => a.time.localeCompare(b.time));
    const withSongs = all.filter((t) => /^\s*M\s*\d/im.test(t.text)).length;
    panel.replaceChildren();

    const h = document.createElement("div");
    h.innerHTML = `<b>lovely-memory コレクター</b> <span style="color:#666">@${HANDLE}</span><br>
      収集 <b>${all.length}</b> 件（曲行あり ${withSongs}）／ 本文が切れている <b style="color:${truncated.length ? "#c00" : "#080"}">${truncated.length}</b> 件`;
    panel.append(h);

    const q = document.createElement("div");
    q.style.margin = "6px 0";
    q.innerHTML = "検索（開いたらスクリプトを貼り直す）:<br>";
    QUERIES.forEach((query, i) => {
      const a = document.createElement("a");
      a.href = `https://x.com/search?f=live&q=${encodeURIComponent(`from:${HANDLE} since:${SINCE} ${query}`)}`;
      a.textContent = `[検索${i + 1}]`;
      a.style.marginRight = "8px";
      q.append(a);
    });
    panel.append(q);

    panel.append(
      button(autoTimer ? "■ 自動スクロール停止" : "▶ 自動スクロール", toggleAuto),
      button("JSON を保存", download),
      button("コピー", () => navigator.clipboard.writeText(exportJson())),
      button("全消去", () => {
        if (confirm("収集したデータを消去しますか？")) {
          data.clear();
          localStorage.removeItem(STORE);
          render();
        }
      }),
      button("×", () => panel.remove()),
    );

    if (truncated.length) {
      const list = document.createElement("ol");
      list.style.cssText = "margin:6px 0 0;padding-left:20px";
      for (const t of truncated) {
        const li = document.createElement("li");
        li.innerHTML = `<a href="${t.url}" target="_blank" rel="noopener">${new Date(t.time).toLocaleString("ja-JP")}</a>
          <span style="color:#666">${t.text.split("\n")[0].slice(0, 24)}</span>`;
        list.append(li);
      }
      const note = document.createElement("div");
      note.style.cssText = "margin-top:6px;color:#666";
      note.textContent = "↓ タイムライン上でポストをクリックして詳細を開くと全文が入ります（別タブで開いた場合はそのタブでもスクリプトを実行）";
      panel.append(note, list);
    }
  };

  setInterval(() => {
    scan();
    if (dirty) {
      dirty = false;
      mergeFromStorage();
      localStorage.setItem(STORE, JSON.stringify([...data.values()]));
      render();
    }
  }, 800);

  window.__lovelyMemoryCollector = { show: () => document.body.contains(panel) || document.body.appendChild(panel), data };
  render();
  console.log(`[lovely-memory] collector started. ${data.size} posts restored from localStorage.`);
})();
