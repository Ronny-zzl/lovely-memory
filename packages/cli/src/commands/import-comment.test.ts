import { Setlist } from "@lovely-memory/core";
import { describe, expect, it } from "vitest";
import { successReply } from "./import-comment.ts";

describe("successReply", () => {
  it("出典の URL を <> で囲む（直後の「）」をリンクに含めさせない）", () => {
    const setlist = Setlist.parse({ event: 1, source: "https://x.com/a/status/1", items: ["A", "B"] });
    const reply = successReply("artist", 1, setlist, []);
    expect(reply.split("\n")[0]).toBe("✅ 2 曲を取り込みました（出典: <https://x.com/a/status/1>）");
  });

  it("出典が無ければ書かない", () => {
    const reply = successReply("artist", 1, Setlist.parse({ event: 1, items: ["A"] }), []);
    expect(reply.split("\n")[0]).toBe("✅ 1 曲を取り込みました");
  });
});
