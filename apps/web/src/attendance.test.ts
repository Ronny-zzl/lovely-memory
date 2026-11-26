import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEventernote } from "./attendance.ts";

afterEach(() => vi.unstubAllGlobals());

const stub = (body: unknown) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body)));

describe("fetchEventernote", () => {
  it("reads the attended events", async () => {
    stub({ user: "u", events: [{ id: 1, date: "2026-10-01" }], truncated: false });
    const link = await fetchEventernote("u", "2024-09-28");
    expect(link).toMatchObject({ user: "u", ids: [1] });
    expect(link.incompleteBefore).toBeUndefined();
  });

  it("notes the oldest date read when the list was too long to read to the end", async () => {
    stub({
      user: "u",
      events: [
        { id: 2, date: "2026-11-01" },
        { id: 1, date: "2026-03-21" },
      ],
      truncated: true,
    });
    expect((await fetchEventernote("u", "2024-09-28")).incompleteBefore).toBe("2026-03-21");
  });
});
