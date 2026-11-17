import type { CreditRoles, Song } from "@lovely-memory/core";

export type OfficialTrack = {
  title: string;
  credits: CreditRoles;
  /** 公式サイト上のユニット／名義表記。artist.json の units[].label と照合する */
  unitLabel?: string;
  release: NonNullable<Song["release"]>;
};

export type FetchHtml = (url: string) => Promise<string>;

/** 公式サイトのディスコグラフィを読み、全収録曲（インスト等は除外）を返す */
export type DiscographyAdapter = (indexUrl: string, fetchHtml: FetchHtml) => Promise<OfficialTrack[]>;
