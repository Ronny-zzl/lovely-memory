import type { EventType } from "@lovely-memory/core/runtime";
import { EVENT_TYPE_LABEL } from "../format.ts";
import "./TypeBadges.css";

export function TypeBadges({ types }: { types: EventType[] }) {
  return (
    <>
      {types.map((t) => (
        <span key={t} className={`type-badge type-${t}`}>
          {EVENT_TYPE_LABEL[t]}
        </span>
      ))}
    </>
  );
}
