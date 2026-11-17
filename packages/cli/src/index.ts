import { parseArgs } from "node:util";
import { addSong } from "./commands/add-song";
import { importOfficial } from "./commands/import-official";
import { importWikipedia } from "./commands/import-wikipedia";

const USAGE = `usage: pnpm lm <command> <artistId> [options]

commands:
  import-official    公式サイトのディスコグラフィから songs.json を更新（公式の値を優先）
                     --dry-run      書き込まずに結果を表示
  import-wikipedia   Wikipedia のディスコグラフィから songs.json を補完（空き項目のみ）
                     --era <eraId>  新規追加曲の era を固定（省略時は発売日から判定）
                     --file <path>  ローカルの wikitext を使う
                     --dry-run
  add-song           曲を 1 曲追加（カバー曲・未発売曲など）
                     --title <曲名>  (必須)
                     --cover <原曲アーティスト>
                     --unit <unitId> --era <eraId>
                     --credits "作詞：A　作曲・編曲：B"
                     --alias <別表記>  (複数可)
                     --note <メモ>
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    era: { type: "string" },
    file: { type: "string" },
    "dry-run": { type: "boolean" },
    title: { type: "string" },
    cover: { type: "string" },
    unit: { type: "string" },
    credits: { type: "string" },
    alias: { type: "string", multiple: true },
    note: { type: "string" },
  },
});
const [command, artistId] = positionals;

type Command = (id: string, opts: Record<string, any>) => Promise<void>;
const commands: Record<string, Command> = {
  "import-official": importOfficial,
  "import-wikipedia": importWikipedia,
  "add-song": addSong,
};

const run = command ? commands[command] : undefined;
if (!run || !artistId) {
  console.error(USAGE);
  process.exit(1);
}
try {
  await run(artistId, values);
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
