import { membersOn, type ArtistConfig } from "@lovely-memory/core/runtime";
import { dotStyle, lineColor } from "../member-color.ts";

/**
 * メンバーカラーの丸を並べる（その日に在籍していたメンバー）。出演していないメンバーは白抜き。
 * lineup（出演するメンバーが初めから一部だけのイベントの出演者）があれば、その人たちだけを並べる
 * （イベントに出なかった人は欠席ではないので出さない。曲の行では、その中で歌わなかった人が白抜き）
 */
export function MemberDots({
  artist,
  present,
  date,
  lineup,
}: {
  artist: ArtistConfig;
  present: string[];
  date: string;
  lineup?: string[];
}) {
  const set = new Set(present);
  // その日に在籍していたメンバーだけを並べる（加入前・卒業や休止の後は出さない）
  const members = membersOn(artist.members, date).filter((m) => !lineup || lineup.includes(m.id));
  // イベントの出演者そのもの（一部だけのイベント）なら「出演: …」と添える
  const lineupOnly = !!lineup && members.every((m) => set.has(m.id));
  const absent = members.filter((m) => !set.has(m.id)).map((m) => m.name);
  return (
    <span
      // 全員出演かどうかで見せ方を変えられるように（狭い画面のイベント一覧では、全員出演なら省く）
      className={absent.length ? "member-dots" : "member-dots member-dots-full"}
      role="img"
      title={lineupOnly ? `出演: ${members.map((m) => m.name).join("・")}` : absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
      aria-label={lineupOnly ? `出演: ${members.map((m) => m.name).join("・")}` : absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
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
