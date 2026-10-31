// Labels for the codes the starter-pack format uses. Unknown codes fall back to readable text,
// so a dataset with new room types or features still renders.
import type { Kind } from "@/api/types";
import { sentence } from "./utils";

export const KIND: Record<Kind, { letter: string; label: string }> = {
  lecture: { letter: "L", label: "Lecture" },
  tutorial: { letter: "T", label: "Tutorial" },
  lab: { letter: "P", label: "Lab" },
  exam: { letter: "E", label: "Exam" },
  event: { letter: "★", label: "Event" },
};

export function kindOf(k: string): Kind {
  return (["lecture", "tutorial", "lab", "exam", "event"] as const).includes(k as Kind) ? (k as Kind) : "lecture";
}

export type Aspect = "clear" | "caution" | "stop" | "wait" | "off";

/** Booking request statuses as signal aspects. */
export const BOOKING_STATUS: Record<string, { label: string; aspect: Aspect; board: string }> = {
  approved: { label: "Approved", aspect: "clear", board: "APPROVED" },
  alternative_offered: { label: "Alternative offered", aspect: "caution", board: "ALTERNATIVE" },
  rejected: { label: "Rejected", aspect: "stop", board: "REJECTED" },
  pending_approval: { label: "Waiting for approval", aspect: "wait", board: "AWAITING" },
  submitted: { label: "Submitted", aspect: "wait", board: "SUBMITTED" },
  cancelled: { label: "Cancelled", aspect: "off", board: "CANCELLED" },
  declined: { label: "Declined", aspect: "stop", board: "DECLINED" },
};

export function bookingStatus(s: string) {
  return BOOKING_STATUS[s] ?? { label: sentence(s), aspect: "wait" as Aspect, board: s.toUpperCase() };
}

/** Change proposal statuses. */
export const PROPOSAL_STATUS: Record<string, { label: string; aspect: Aspect }> = {
  pending: { label: "Waiting for Admin", aspect: "wait" },
  approved: { label: "Applied", aspect: "clear" },
  rejected: { label: "Rejected", aspect: "stop" },
  infeasible: { label: "No valid fix", aspect: "stop" },
};

export function proposalStatus(s: string) {
  return PROPOSAL_STATUS[s] ?? { label: sentence(s), aspect: "wait" as Aspect };
}

export const PROPOSAL_KIND: Record<string, string> = {
  file: "Change file",
  request: "Change request",
  unavailability: "Unavailability",
  manual: "Manual move",
};

export const CATEGORY: Record<string, string> = {
  institute_event: "Institute event",
  guest_lecture: "Guest lecture",
  department_event: "Department event",
  club_event: "Club event",
};

export const categoryLabel = (c: string) => CATEGORY[c] ?? sentence(c);

const ROOM_TYPE: Record<string, string> = {
  classroom: "Classroom",
  lecture_hall: "Lecture hall",
  auditorium: "Auditorium",
  seminar_hall: "Seminar hall",
  outdoor: "Open air",
  lab_cs: "Computer lab",
  lab_elec: "Electronics lab",
  lab_phy: "Physics lab",
  workshop: "Workshop",
  lab_civil: "Civil lab",
};

export const roomTypeLabel = (t: string) => ROOM_TYPE[t] ?? sentence(t);

const FEATURE: Record<string, string> = {
  projector: "Projector",
  pa_system: "PA system",
  stage: "Stage",
  ac: "Air conditioning",
  accessible: "Step-free access",
  computers: "Computers",
  smart_board: "Smart board",
  video_conf: "Video conferencing",
};

export const featureLabel = (f: string) => FEATURE[f] ?? sentence(f);

export const ROLE: Record<string, string> = {
  admin: "Admin",
  coordinator: "Department coordinator",
  faculty: "Faculty",
  club: "Club representative",
};

export const SOFT_RULES: Record<string, string> = {
  S1: "Teaching in a faculty member's avoided slot",
  S2: "Gaps in a group's day",
  S3: "Faculty teaching over 6 hours a day",
  S4: "Same lecture twice in a day",
  S5: "Room much bigger than the class",
  S6: "Classes in the last period",
};

/** Rule codes used by the checker and starter_pack/validator.py, in plain words. */
export const RULES: Record<string, string> = {
  H1: "Placed exactly once",
  H2: "Faculty double-booked",
  H3: "Group double-booked",
  H4: "Room double-booked",
  H5: "Not enough seats",
  H6: "Wrong room type",
  H7: "Faculty unavailable",
  H8: "Room unavailable",
  H9: "Teaching hours, lunch or lab start",
  H10: "Needs step-free access",
  H11: "Elective basket split",
  H12: "Faculty over daily hours",
  H13: "Venue booking clash",
  H14: "Fixed slot moved",
  B1: "Booking decision",
  B2: "Week 7 override",
  B3: "Cancelled request",
  E1: "Exam placement",
  E2: "Room can't host exams",
};

export const ruleLabel = (code: string) => RULES[code] ?? code;
