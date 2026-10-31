import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./client";
import type {
  BookingCheck,
  BookingDraft,
  BookingParse,
  BookingSubmit,
  Booking,
  ChangeIntent,
  ChangeParse,
  Dashboard,
  DatasetLoaded,
  DemoAccount,
  ExamsOut,
  ExplainBooking,
  ExplainSession,
  FestOut,
  FestSummary,
  FreeRoom,
  GenerateOut,
  Health,
  ManualMoveIn,
  ManualMoveOut,
  Proposal,
  RoleIn,
  Settings,
  SignupOptions,
  Summary,
  TimetableOut,
  User,
  VeloIn,
  VeloActionOut,
  VeloOut,
  View,
  Week,
} from "./types";

// ---------------------------------------------------------------- queries
export const useDemoAccounts = () =>
  useQuery({ queryKey: ["demo-accounts"], queryFn: () => request<DemoAccount[]>("/auth/demo-accounts"), staleTime: 60_000 });

export const useSignupOptions = (enabled: boolean) =>
  useQuery({ queryKey: ["signup-options"], queryFn: () => request<SignupOptions>("/auth/signup-options"), enabled, staleTime: 300_000 });

export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => request<User[]>("/users") });

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => request<Health>("/health"), staleTime: 30_000 });

export const useSummary = () =>
  useQuery({ queryKey: ["summary"], queryFn: () => request<Summary>("/data/summary"), staleTime: 60_000 });

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: () => request<Dashboard>("/dashboard") });

export const useTimetable = (view: View, id: string, week: Week, enabled = true) =>
  useQuery({
    queryKey: ["timetable", view, id, week],
    queryFn: () => request<TimetableOut>("/timetable", { query: { view, id, week } }),
    enabled: enabled && (view === "all" || !!id),
    placeholderData: keepPreviousData,
  });

export const useExplainSession = (id: string | null, words = false) =>
  useQuery({
    queryKey: ["explain-session", id, words],
    queryFn: () => request<ExplainSession>(`/explain/session/${encodeURIComponent(id!)}`, { query: { words: words || undefined } }),
    enabled: !!id,
    staleTime: 30_000,
  });

export const useExplainBooking = (id: string | null, words = false) =>
  useQuery({
    queryKey: ["explain-booking", id, words],
    queryFn: () => request<ExplainBooking>(`/explain/booking/${encodeURIComponent(id!)}`, { query: { words: words || undefined } }),
    enabled: !!id,
    retry: false,
  });

export const useExams = () => useQuery({ queryKey: ["exams"], queryFn: () => request<ExamsOut>("/exams") });

export const useFest = () => useQuery({ queryKey: ["fest"], queryFn: () => request<FestOut>("/fest") });

export const useBookings = (mine: boolean) =>
  useQuery({ queryKey: ["bookings", mine], queryFn: () => request<Booking[]>("/bookings", { query: { mine: mine || undefined } }) });

export const useChanges = (status?: string) =>
  useQuery({ queryKey: ["changes", status ?? "all"], queryFn: () => request<Proposal[]>("/changes", { query: { status } }) });

export const useChange = (id: number | null) =>
  useQuery({ queryKey: ["change", id], queryFn: () => request<Proposal>(`/changes/${id}`), enabled: id != null });

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => request<Settings>("/settings") });

export interface FreeRoomQuery {
  day: string;
  from: number;
  to: number;
  capacity: number;
  needs: string[];
  types: string[];
  week: Week;
}

export const useFreeRooms = (q: FreeRoomQuery | null) =>
  useQuery({
    queryKey: ["free-rooms", q],
    queryFn: () =>
      request<FreeRoom[]>("/rooms/free", {
        query: { day: q!.day, from: q!.from, to: q!.to, capacity: q!.capacity, needs: q!.needs.join(","), types: q!.types.join(","), week: q!.week },
      }),
    enabled: !!q,
    placeholderData: keepPreviousData,
  });

// ---------------------------------------------------------------- mutations
/** Anything that changes the timetable, bookings or proposals can change every view. */
function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({ predicate: (q) => !["demo-accounts", "signup-options", "health"].includes(String(q.queryKey[0])) });
}

function useStateMutation<TIn, TOut>(fn: (input: TIn) => Promise<TOut>) {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: fn, onSuccess: () => refresh() });
}

export const useGenerateTimetable = () =>
  useStateMutation((time_limit_s?: number) => request<GenerateOut>("/timetable/generate", { body: { time_limit_s } }));

export const useGenerateExams = () =>
  useStateMutation((time_limit_s?: number) => request<ExamsOut>("/exams/generate", { body: { time_limit_s } }));

export const useDecideAll = () => useStateMutation(() => request<FestSummary>("/fest/decide-all", { method: "POST" }));

export const useResetDemo = () => useStateMutation(() => request<{ ok: boolean }>("/admin/reset", { method: "POST" }));

export const useUploadDataset = () =>
  useStateMutation((file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DatasetLoaded>("/data/dataset", { form, method: "POST" });
  });

export const useUploadChangeFile = () =>
  useStateMutation((file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Proposal>("/changes/file", { form, method: "POST" });
  });

export const useApproveChange = () =>
  useStateMutation(({ id, note }: { id: number; note?: string }) => request<Proposal>(`/changes/${id}/approve`, { body: { note: note ?? "" } }));

export const useRejectChange = () =>
  useStateMutation(({ id, note }: { id: number; note?: string }) => request<Proposal>(`/changes/${id}/reject`, { body: { note: note ?? "" } }));

export const useRequestChange = () => useStateMutation((intent: ChangeIntent) => request<Proposal>("/changes", { body: intent }));

export const useUnavailability = () =>
  useStateMutation((body: { days: string[]; periods: number[]; reason: string }) => request<Proposal>("/faculty/unavailability", { body }));

export const useSubmitBooking = () => useStateMutation((draft: BookingDraft) => request<BookingSubmit>("/bookings", { body: draft }));

export const useCancelBooking = () =>
  useStateMutation((id: string) => request<Booking>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" }));

export const useDecideBooking = () =>
  useStateMutation(({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) =>
    request<Booking>(`/bookings/${encodeURIComponent(id)}/decide`, { body: { action, note: note ?? "" } }),
  );

export const useManualMove = () => useStateMutation((body: ManualMoveIn) => request<ManualMoveOut>("/timetable/manual", { body }));

export const usePutSettings = () => useStateMutation((body: Settings) => request<Settings>("/settings", { method: "PUT", body }));

// accounts: a role change only touches the account list, not the timetable
export const useSetRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: RoleIn & { id: number }) => request<User>(`/users/${id}`, { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => request<{ ok: boolean }>("/auth/password", { body }),
  });

// read-only calls that are still triggered by the user
export const useParseBooking = () =>
  useMutation({ mutationFn: (body: { text: string; today?: string }) => request<BookingParse>("/assistant/booking", { body }) });

export const useTranscribe = () =>
  useMutation({
    mutationFn: (wav: Blob) => {
      const form = new FormData();
      form.append("audio", wav, "voice.wav");
      return request<{ text: string }>("/assistant/transcribe", { form });
    },
  });

/** Velo answers from the same code the pages use and never changes anything itself. */
export const useAskVelo = () => useMutation({ mutationFn: (body: VeloIn) => request<VeloOut>("/velo", { body }) });

/** Run a change Velo prepared (once; the server refuses expired or stale ones), then refresh every page. */
export const useConfirmVeloAction = () =>
  useStateMutation((id: string) => request<VeloActionOut>(`/velo/actions/${encodeURIComponent(id)}/confirm`, { method: "POST" }));

export const useParseChange = () =>
  useMutation({ mutationFn: (body: { text: string; today?: string }) => request<ChangeParse>("/assistant/change", { body }) });

export const checkBooking = (draft: BookingDraft, signal?: AbortSignal) =>
  request<BookingCheck>("/bookings/check", { body: draft, signal });

export const checkMove = (body: ManualMoveIn) => request<ManualMoveOut>("/timetable/check-move", { body });
