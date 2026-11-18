import * as cheerio from "cheerio";
import type { Event } from "@lovely-memory/core";

export type ListPage = {
  events: Event[];
  /** 次のページが存在するか */
  hasNext: boolean;
};

function idFromHref(href: string | undefined, kind: "events" | "places" | "actors"): number | undefined {
  if (!href) return undefined;
  const m = href.match(kind === "actors" ? /\/actors\/[^/]*\/(\d+)/ : new RegExp(`/${kind}/(\\d+)`));
  return m ? Number(m[1]) : undefined;
}

function time(text: string, label: string): string | undefined {
  return text.match(new RegExp(`${label}\\s*(\\d{1,2}:\\d{2})`))?.[1];
}

/**
 * アクター別イベント一覧（/actors/<id>/events?...）の 1 ページを解析する。
 * 構造: .gb_event_list > ul > li に 1 イベント
 */
export function parseEventList(html: string): ListPage {
  const $ = cheerio.load(html);
  const events: Event[] = [];

  $(".gb_event_list > ul > li").each((_, li) => {
    const $li = $(li);
    const link = $li.find(".event h4 a").first();
    const id = idFromHref(link.attr("href"), "events");
    const date = $li
      .find(".date p")
      .first()
      .text()
      .match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!id || !date) return;

    const placeLink = $li.find(".event .place a").first();
    // イベンターノートでは「!_東京都内各所 (サーキットイベント等)」のように、
    // 特定の会場ではない仮の会場名に「!_」が付いている
    const venueName = placeLink.text().trim().replace(/^!_/, "");
    const timeText = $li.find(".event .place .s").text();
    const performers = $li
      .find(".actor li a")
      .map((_, a) => idFromHref($(a).attr("href"), "actors"))
      .get()
      .filter((x): x is number => typeof x === "number");

    events.push({
      id,
      date,
      title: link.text().trim(),
      venue: venueName ? { id: idFromHref(placeLink.attr("href"), "places"), name: venueName } : undefined,
      open: time(timeText, "開場"),
      start: time(timeText, "開演"),
      end: time(timeText, "終演"),
      performers,
    });
  });

  return { events, hasNext: $(".pagination li.next a, li.next a").length > 0 };
}
