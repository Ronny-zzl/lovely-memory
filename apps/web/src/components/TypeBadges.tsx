import type { EventType } from "@lovely-memory/core";
import { EVENT_TYPE_LABEL } from "../format.ts";

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
