import type { ArtistConfig } from "@lovely-memory/core/runtime";
import { MoonIcon, SunIcon } from "./Icons.tsx";
import "./UnitTag.css";

type Unit = ArtistConfig["units"][number];

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
