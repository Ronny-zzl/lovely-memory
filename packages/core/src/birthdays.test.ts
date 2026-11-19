import { describe, expect, it } from "vitest";
import { ageOn, birthdayIn, birthdayMembers, nextBirthday, upcomingBirthdays } from "./birthdays.ts";
import type { Member } from "./schema.ts";

const m = (id: string, birthday?: string): Member => ({ id, name: id, color: "#000000", birthday });
const members = [m("a", "2007-07-28"), m("b", "2004-04-02"), m("c", "2007-02-25"), m("leap", "2004-02-29"), m("none")];

describe("birthdays", () => {
  it("finds the next birthday, today included", () => {
    expect(nextBirthday(members[0]!, "2026-11-17")).toMatchObject({ date: "2027-07-28", days: 253, age: 20 });
    expect(nextBirthday(members[1]!, "2026-04-02")).toMatchObject({ date: "2026-04-02", days: 0, age: 22 });
    expect(nextBirthday(members[4]!, "2026-11-17")).toBeUndefined();
  });

  it("treats 2/29 as 2/28 outside leap years", () => {
    expect(birthdayIn("2004-02-29", 2027)).toBe("2027-02-28");
    expect(birthdayIn("2004-02-29", 2028)).toBe("2028-02-29");
  });

  it("orders by days left and finds birthdays on a date", () => {
    expect(upcomingBirthdays(members, "2026-11-17").map((b) => b.member.id)).toEqual(["c", "leap", "b", "a"]);
    expect(birthdayMembers(members, "2027-02-28").map((x) => x.id)).toEqual(["leap"]);
    expect(birthdayMembers(members, "2026-07-28").map((x) => x.id)).toEqual(["a"]);
  });

  it("computes ages, turning a year older on the birthday", () => {
    expect(ageOn("2007-02-25", "2026-11-17")).toBe(19);
    expect(ageOn("2007-02-25", "2027-02-24")).toBe(19);
    expect(ageOn("2007-02-25", "2027-02-25")).toBe(20);
    expect(ageOn("2004-02-29", "2027-02-27")).toBe(22);
    expect(ageOn("2004-02-29", "2027-02-28")).toBe(23);
  });
});
