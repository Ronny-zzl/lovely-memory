import { membersOn, type ArtistConfig } from "@lovely-memory/core/runtime";
import { dotStyle, lineColor } from "../member-color.ts";

/** メンバーカラーの丸を並べる（その日に在籍していたメンバー）。出演していないメンバーは白抜き */
export function MemberDots({ artist, present, date }: { artist: ArtistConfig; present: string[]; date: string }) {
  const set = new Set(present);
  // その日に在籍していたメンバーだけを並べる（加入前・卒業や休止の後は出さない）
  const members = membersOn(artist.members, date);
  const absent = members.filter((m) => !set.has(m.id)).map((m) => m.name);
  return (
    <span
      // 全員出演かどうかで見せ方を変えられるように（狭い画面のイベント一覧では、全員出演なら省く）
      className={absent.length ? "member-dots" : "member-dots member-dots-full"}
      role="img"
      title={absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
      aria-label={absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
    >
      {members.map((m) => (
        <span
          key={m.id}
          className={set.has(m.id) ? "dot" : "dot dot-absent"}
          style={set.has(m.id) ? dotStyle(m.color) : { borderColor: lineColor(m.color) }}
        />
      ))}
    </span>
  );
}
