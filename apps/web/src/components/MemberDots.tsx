import type { ArtistConfig } from "@lovely-memory/core/runtime";
import { dotStyle, lineColor } from "../member-color.ts";

/** メンバーカラーの丸を並べる。出演していないメンバーは白抜き */
export function MemberDots({ artist, present }: { artist: ArtistConfig; present: string[] }) {
  const set = new Set(present);
  const absent = artist.members.filter((m) => !set.has(m.id)).map((m) => m.name);
  return (
    <span
      // 全員出演かどうかで見せ方を変えられるように（狭い画面のイベント一覧では、全員出演なら省く）
      className={absent.length ? "member-dots" : "member-dots member-dots-full"}
      role="img"
      title={absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
      aria-label={absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
    >
      {artist.members.map((m) => (
        <span
          key={m.id}
          className={set.has(m.id) ? "dot" : "dot dot-absent"}
          style={set.has(m.id) ? dotStyle(m.color) : { borderColor: lineColor(m.color) }}
        />
      ))}
    </span>
  );
}
