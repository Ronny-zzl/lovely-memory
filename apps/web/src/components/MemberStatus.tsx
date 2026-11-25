import { memberStatus, type Member } from "@lovely-memory/core/runtime";

/** 名前の横に出す「活動休止中」「卒業」など（artist.json の until・untilLabel。最後の活動日を過ぎてから出す） */
export function MemberStatus({ member, today }: { member: Member; today: string }) {
  const label = memberStatus(member, today);
  return label ? <span className="member-status">{label}</span> : null;
}
