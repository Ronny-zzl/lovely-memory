import { parseArgs } from "node:util";
import { importWikipedia } from "./commands/import-wikipedia";

const USAGE = `usage: pnpm lm <command> <artistId> [options]

commands:
  import-wikipedia   Wikipedia のディスコグラフィから songs.json を作成・補完
                     --era <eraId>  新規追加曲に付ける era
                     --file <path>  ローカルの wikitext を使う
                     --dry-run      書き込まずに結果を表示
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    era: { type: "string" },
    file: { type: "string" },
    "dry-run": { type: "boolean" },
  },
});
const [command, artistId] = positionals;

const commands: Record<string, (id: string, opts: Record<string, string | boolean>) => Promise<void>> = {
  "import-wikipedia": importWikipedia,
};

const run = command ? commands[command] : undefined;
if (!run || !artistId) {
  console.error(USAGE);
  process.exit(1);
}
await run(artistId, values as Record<string, string | boolean>);
