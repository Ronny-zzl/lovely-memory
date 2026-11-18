import type { ArtistConfig } from "@lovely-memory/core/runtime";
import "./UnitTag.css";

type Unit = ArtistConfig["units"][number];

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="8" y1="1.6" x2="8" y2="3" transform={`rotate(${i * 45} 8 8)`} />
        ))}
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.2 2.2A6 6 0 1 0 13.8 11 4.8 4.8 0 0 1 10.2 2.2Z" fill="currentColor" />
      <path d="M13 2.4l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35Z" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/** ユニット名のタグ。motif があれば日・月の意匠で表示する */
export function UnitTag({ unit }: { unit: Unit }) {
  if (!unit.motif) return <span className="unit">{unit.label}</span>;
  return (
    <span className={`unit-tag unit-${unit.motif}`}>
      <span className="unit-icon">{unit.motif === "sun" ? <SunIcon /> : <MoonIcon />}</span>
      {unit.label}
    </span>
  );
}
