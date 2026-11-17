import { describe, expect, it } from "vitest";
import { parseEventList } from "./parse.ts";

// 2026-11 時点の実際の HTML を縮約（閉じタグの崩れ <span ...>...</p> も実物どおり）
const HTML = `
<div class="pagination"><ul>
<li class=active><span>1</span></li>
<li class=next><a href="/actors/72524/events?actor_id=72524&limit=20&page=2">&gt;</a></li>
</ul></div>
<div class="gb_event_list clearfix">
  <ul>
    <li class="clearfix ">
      <div class="date">
        <p class="day5">2026-09-04 (<span class="wday5">金</span>)</p>
      </div>
      <div class="event">
        <h4><a href="/events/486948">太陽と踊れ月夜に唄え Second Season Debut LIVE～ふたつの空の下で～</a></h4>
        <div class="place">
          会場: <a href="/places/10770">harevutai</a>
        </div>
        <div class="place">
          <span class="s">開場 18:30 開演 19:00 終演 21:00</p>
        </div>
        <div class="actor"><ul>
          <li>出演者:</li>
          <li><a href="/actors/%E5%A4%AA%E9%99%BD/72524">太陽と踊れ月夜に唄え</a></li>
          <li><a href="/actors/%E7%94%98%E4%B9%83/94952">甘乃あんね</a></li>
          <li><a href="/actors/%E5%A4%9C%E5%87%AA%28%E9%AB%98%E6%A9%8B%2F%E6%9C%88%E5%AE%AE%29/94956">夜凪織乃(高橋玲乃/月宮れの)</a></li>
        </ul></div>
      </div>
      <div class="note_count"><p title="参加者数">12</p></div>
    </li>
    <li class="clearfix ">
      <div class="date"><p class="day6">2026-12-05 (<span class="wday6">土</span>)</p></div>
      <div class="event">
        <h4><a href="/events/499479">SPARK 2026 -秋葉原冬祭- DAY１</a></h4>
        <div class="place">会場: <a href="/places/1">秋葉原駅周辺</a></div>
        <div class="actor"><ul><li>出演者:</li></ul></div>
      </div>
    </li>
  </ul>
</div>`;

describe("parseEventList", () => {
  it("extracts events with venue, times and performer ids", () => {
    const { events, hasNext } = parseEventList(HTML);
    expect(hasNext).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      id: 486948,
      date: "2026-09-04",
      title: "太陽と踊れ月夜に唄え Second Season Debut LIVE～ふたつの空の下で～",
      venue: { id: 10770, name: "harevutai" },
      open: "18:30",
      start: "19:00",
      end: "21:00",
      performers: [72524, 94952, 94956],
    });
  });

  it("tolerates missing times and performers", () => {
    const e = parseEventList(HTML).events[1]!;
    expect(e.open).toBeUndefined();
    expect(e.start).toBeUndefined();
    expect(e.performers).toEqual([]);
  });

  it("detects the last page", () => {
    expect(parseEventList(HTML.replace(/<li class=next>.*?<\/li>/, "")).hasNext).toBe(false);
  });
});
