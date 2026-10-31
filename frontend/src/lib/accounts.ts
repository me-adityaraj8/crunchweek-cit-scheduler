import type { DemoAccount } from "@/api/types";

export interface AccountOption {
  value: string; // email
  label: string;
  group?: string;
}

/** Demo accounts for the login tiles: the Admin, plus a sorted dropdown each for coordinators
 * (by department), faculty (grouped by department) and clubs. */
export function byRole(accounts: DemoAccount[]) {
  // the ADMIN department (Dean's office staff) goes after the teaching departments
  const last = (g?: string) => (g === "ADMIN" ? 1 : 0);
  const sort = (a: AccountOption, b: AccountOption) =>
    last(a.group) - last(b.group) || (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label);
  const pick = (role: DemoAccount["role"], toOption: (a: DemoAccount) => AccountOption) =>
    accounts.filter((a) => a.role === role).map(toOption).sort(sort);
  return {
    admin: accounts.find((a) => a.role === "admin") ?? null,
    coordinator: pick("coordinator", (a) => ({ value: a.email, label: a.department ?? a.name })),
    faculty: pick("faculty", (a) => ({ value: a.email, label: a.name, group: a.department ?? undefined })),
    club: pick("club", (a) => ({ value: a.email, label: a.name })),
  };
}
