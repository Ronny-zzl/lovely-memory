import type { ArtistConfig } from "@lovely-memory/core/runtime";

/** メンバーカラーの丸を並べる。出演していないメンバーは白抜き */
export function MemberDots({ artist, present }: { artist: ArtistConfig; present: string[] }) {
  const set = new Set(present);
  const absent = artist.members.filter((m) => !set.has(m.id)).map((m) => m.name);
  return (
    <span
      className="member-dots"
      title={absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
      aria-label={absent.length ? `欠席: ${absent.join("・")}` : "全員出演"}
    >
      {artist.members.map((m) => (
        <span
          key={m.id}
          className={set.has(m.id) ? "dot" : "dot dot-absent"}
          style={set.has(m.id) ? { background: m.color } : { borderColor: m.color }}
        />
      ))}
    </span>
  );
}
