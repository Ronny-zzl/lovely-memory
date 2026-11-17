import type { Member } from "./schema.ts";

/*
 * メンバーの誕生日。日付はすべて Asia/Tokyo の YYYY-MM-DD 文字列で扱う。
 * 2/29 生まれは、うるう年でない年は 2/28 を誕生日とする。
 */

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** year 年の誕生日 */
export function birthdayIn(birthday: string, year: number): string {
  const md = birthday.slice(5);
  return `${year}-${md === "02-29" && !isLeap(year) ? "02-28" : md}`;
}

function daysBetween(from: string, to: string): number {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(to) - t(from)) / 86_400_000);
}

export type NextBirthday = { member: Member; date: string; days: number };

/** 次の誕生日（今日なら days = 0） */
export function nextBirthday(member: Member, today: string): NextBirthday | undefined {
  if (!member.birthday) return undefined;
  const year = Number(today.slice(0, 4));
  let date = birthdayIn(member.birthday, year);
  if (date < today) date = birthdayIn(member.birthday, year + 1);
  return { member, date, days: daysBetween(today, date) };
}

/** 誕生日の近い順 */
export function upcomingBirthdays(members: Member[], today: string): NextBirthday[] {
  return members
    .map((m) => nextBirthday(m, today))
    .filter((b): b is NextBirthday => !!b)
    .sort((a, b) => a.days - b.days);
}

/** date が誕生日のメンバー */
export function birthdayMembers(members: Member[], date: string): Member[] {
  return members.filter((m) => m.birthday && birthdayIn(m.birthday, Number(date.slice(0, 4))) === date);
}
