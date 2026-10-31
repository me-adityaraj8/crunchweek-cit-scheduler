// Friendly names for the response shapes generated from the API's OpenAPI schema.
// Regenerate schema.d.ts with `npm run types` (API running on :8000) after a backend change.
import type { components } from "./schema";

type S = components["schemas"];

export type Role = S["UserOut"]["role"];
export type User = S["UserOut"];
export type LoginOut = S["LoginOut"];
export type DemoAccount = S["DemoAccount"];
export type SignupIn = S["SignupIn"];
export type SignupOptions = S["SignupOptions"];
export type FacultyChoice = S["FacultyChoice"];
export type RoleIn = S["RoleIn"];

export type Summary = S["SummaryOut"];
export type Room = S["RoomOut"];
export type Faculty = S["FacultyOut"];
export type Group = S["GroupOut"];
export type Period = S["PeriodOut"];
export type Counts = S["Counts"];
export type DatasetLoaded = S["DatasetLoaded"];

export type GenerateOut = S["GenerateOut"];
export type Entry = S["Entry"];
export type BookingEntry = S["BookingEntry"];
export type TimetableOut = S["TimetableOut"];
export type ManualMoveIn = S["ManualMoveIn"];
export type ManualMoveOut = S["ManualMoveOut"];
export type ExplainSession = S["ExplainSessionOut"];
export type Alternative = S["Alternative"];
export type Violation = S["ViolationOut"];
export type Conflict = S["ConflictOut"];
export type Slot = S["Slot"];

export type Exam = S["ExamOut"];
export type ExamsOut = S["ExamsOut"];

export type Window = S["Window"];
export type BookingDraft = S["BookingDraft"];
export type PartialDraft = S["PartialDraft"];
export type BookingParse = S["BookingParseOut"];
export type BookingCheck = S["BookingCheckOut"];
export type Booking = S["BookingOut"];
export type BookingSubmit = S["BookingSubmitOut"];
export type Decision = S["DecisionOut"];
export type FestSummary = S["FestSummary"];
export type FestOut = S["FestOut"];
export type ExplainBooking = S["ExplainBookingOut"];

export type Proposal = S["ProposalOut"];
export type Move = S["Move"];
export type ChangeIntent = S["ChangeIntent"];
export type ChangeParse = S["ChangeParseOut"];

export type Dashboard = S["DashboardOut"];
export type RoomUse = S["RoomUse"];
export type PendingItem = S["PendingItem"];
export type FreeRoom = S["FreeRoom"];
export type Settings = S["SettingsOut"];
export type Health = S["Health"];
export type VeloIn = S["VeloIn"];
export type VeloOut = S["VeloOut"];
export type VeloActionOut = S["VeloActionOut"];
export type VeloCard = S["VeloCard"];
export type VeloFocus = S["VeloFocus"];

export type Kind = "lecture" | "tutorial" | "lab" | "exam" | "event";
export type View = "group" | "faculty" | "room" | "all";
export type Week = "regular" | "spectra";
