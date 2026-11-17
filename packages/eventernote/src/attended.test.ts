import { describe, expect, it } from "vitest";
import { AttendedError, attendedUrl, fetchAttended, parseAttendedPage } from "./attended.ts";

const item = (id: number, date: string) => `
      <li class="clearfix ">
      <div class="date">
        <p class="day0">${date} (<span class="wday0">日</span>)</p>
        <p><img src="https://example.com/${id}_s.jpg" alt="x"></p>
     </div>
      <div class="event">
        <h4><a href="/events/${id}">イベント ${id}</a></h4>
          <div class="place">会場: <a href="/places/1">会場</a></div>
        <div class="actor"><ul><li>出演者:</li><li><a href="/actors/x/72524">太陽と踊れ月夜に唄え</a></li></ul></div>
      </div>
      </li>`;

const page = (items: Array<[number, string]>, next: boolean) => `<html><body>
<div class="pagination pagination-centered"><ul>
<li class=active><span>1</span></li>
${next ? `<li class=next><a href="/users/u/events?page=2&user_id=1">&gt;</a></li>` : `<li class="next disabled"><span>&gt;</span></li>`}
</ul></div>
<div class="gb_event_list clearfix"><ul>${items.map(([id, d]) => item(id, d)).join("")}</ul></div>
</body></html>`;

describe("parseAttendedPage", () => {
  it("extracts event ids and dates, and whether there is a next page", () => {
    const r = parseAttendedPage(page([[498229, "2026-12-27"], [486948, "2026-09-04"]], true));
    expect(r.events).toEqual([
      { id: 498229, date: "2026-12-27" },
      { id: 486948, date: "2026-09-04" },
    ]);
    expect(r.hasNext).toBe(true);
    expect(parseAttendedPage(page([], false)).hasNext).toBe(false);
  });
});

describe("fetchAttended", () => {
  const pages = [
    page([[3, "2026-12-01"], [2, "2026-10-01"]], true),
    page([[1, "2026-09-04"], [0, "2026-08-31"]], true),
    page([[-1, "2026-01-01"]], false),
  ];
  const fakeFetch = (calls: string[]) =>
    (async (url: string) => {
      calls.push(url);
      const n = Number(new URL(url).searchParams.get("page") ?? 1);
      return new Response(pages[n - 1] ?? page([], false));
    }) as unknown as typeof fetch;

  it("stops at the first page that goes back past `since`", async () => {
    const calls: string[] = [];
    const r = await fetchAttended("Ronny62", { since: "2026-09-04", fetch: fakeFetch(calls) });
    expect(r.events.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(r.pages).toBe(2);
    expect(calls).toEqual([attendedUrl("Ronny62"), attendedUrl("Ronny62", 2)]);
  });

  it("respects the page limit", async () => {
    const r = await fetchAttended("u", { since: "2000-01-01", fetch: fakeFetch([]), maxPages: 2 });
    expect(r).toMatchObject({ pages: 2, truncated: true });
  });

  it("rejects bad usernames without fetching and reports unknown users", async () => {
    const calls: string[] = [];
    await expect(fetchAttended("../x", { since: "2026-01-01", fetch: fakeFetch(calls) })).rejects.toMatchObject({ status: "invalid" });
    expect(calls).toEqual([]);
    const notFound = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchAttended("nobody", { since: "2026-01-01", fetch: notFound })).rejects.toBeInstanceOf(AttendedError);
  });
});
