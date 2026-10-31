import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useSetRole, useSummary, useUsers } from "@/api/hooks";
import type { Role, User } from "@/api/types";
import { Code } from "@/components/board/signals";
import { ErrorState, Loading, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Select, type Option } from "@/components/ui/select";
import { useUser } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { plural } from "@/lib/utils";

const ROLES: Option[] = (["club", "faculty", "coordinator", "admin"] as const).map((r) => ({ value: r, label: ROLE[r] }));

const where = (u: User) => [ROLE[u.role], u.department, u.faculty_id].filter(Boolean).join(", ");

function Who({ u, tag }: { u: User; tag?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-anthracite text-[12px] font-bold text-on-anthracite">
        {u.name.replace(/^(Dr\.|Prof\.)\s+/, "").slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold">{u.name}</span>
          {tag && <Code>{tag}</Code>}
        </div>
        <div className="truncate text-[12.5px] text-ink-2">{u.email}</div>
      </div>
    </div>
  );
}

/** Someone's own account. The Admin picks its role, and the department or faculty member it stands for. */
function PersonRow({ u, departments, faculty }: { u: User; departments: string[]; faculty: Option[] }) {
  const assign = useSetRole();
  const [role, setRole] = useState<Role>(u.role);
  const [department, setDepartment] = useState(u.department ?? undefined);
  const [facultyId, setFacultyId] = useState(u.faculty_id ?? undefined);

  const complete = role === "coordinator" ? !!department : role === "faculty" ? !!facultyId : true;
  const changed =
    role !== u.role || (role === "coordinator" && department !== u.department) || (role === "faculty" && facultyId !== u.faculty_id);
  const save = () =>
    assign.mutate(
      { id: u.id, role, department: role === "coordinator" ? department : null, faculty_id: role === "faculty" ? facultyId : null },
      {
        onSuccess: (out) => toast.success(`${out.name}: ${where(out)}`, { description: "Applies from their next click." }),
        onError: (e) => toast.error("Couldn't change the role", { description: errorMessage(e) }),
      },
    );

  return (
    <li className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
      <Who u={u} />
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={`Role of ${u.name}`} value={role} onValueChange={(v) => setRole(v as Role)} options={ROLES} className="w-[224px]" />
        {role === "coordinator" && (
          <Select
            aria-label={`Department ${u.name} coordinates`}
            value={department}
            onValueChange={setDepartment}
            options={departments.map((d) => ({ value: d, label: d }))}
            placeholder="Department"
            className="w-[128px]"
          />
        )}
        {role === "faculty" && (
          <Select
            aria-label={`Faculty member ${u.name} is`}
            value={facultyId}
            onValueChange={setFacultyId}
            options={faculty}
            placeholder="Faculty member"
            className="w-[210px]"
          />
        )}
        <Button size="sm" variant="primary" disabled={!changed || !complete || assign.isPending} onClick={save}>
          {assign.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </div>
    </li>
  );
}

/** Admin only: every account, and the roles that only an Admin can give. */
export function People() {
  const me = useUser();
  const users = useUsers();
  const { data: summary } = useSummary();

  let body;
  if (users.isLoading) body = <Loading rows={3} />;
  else if (users.isError) body = <ErrorState error={users.error} onRetry={() => users.refetch()} />;
  else {
    const own = users.data!.filter((u) => !u.demo);
    const demo = users.data!.filter((u) => u.demo);
    const departments = (summary?.departments ?? []).filter((d) => d !== "COMMON" && d !== "ADMIN");
    const faculty = (summary?.faculty ?? []).map((f) => ({ value: f.id, label: f.name, hint: f.id, group: f.department }));
    body = (
      <>
        {own.length === 0 ? (
          <p className="rounded-[6px] border border-dashed border-rule-strong px-4 py-5 text-[13.5px] text-ink-2">
            No one has signed up yet. Accounts people make on the login page show up here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {own.map((u) =>
              u.id === me.id ? (
                <li key={u.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <Who u={u} tag="You" />
                  <span className="text-[12.5px] text-ink-2">{where(u)}</span>
                </li>
              ) : (
                <PersonRow key={u.id} u={u} departments={departments} faculty={faculty} />
              ),
            )}
          </ul>
        )}
        <details className="mt-3 rounded-[6px] border border-rule">
          <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
            {plural(demo.length, "demo account")}, shared by everyone trying the app
          </summary>
          <p className="border-t border-rule px-3 pt-2.5 text-[12.5px] text-ink-3">They follow the loaded dataset, so they can't be changed here.</p>
          <ul className="flex flex-col divide-y divide-rule px-3">
            {demo.map((u) => (
              <li key={u.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <Who u={u} tag={u.id === me.id ? "You" : "Demo"} />
                <span className="text-[12.5px] text-ink-2">{where(u)}</span>
              </li>
            ))}
          </ul>
        </details>
      </>
    );
  }

  return (
    <section className="sheet p-4 sm:p-5">
      <SectionTitle aside={users.data && <span className="text-[12.5px] text-ink-3">{plural(users.data.filter((u) => !u.demo).length, "own account")}</span>}>
        People
      </SectionTitle>
      <p className="-mt-2 mb-3 max-w-[82ch] text-[13px] text-ink-2">
        Anyone can sign up on the login page as a club representative or a faculty member. Coordinators and Admins approve requests, so only an Admin gives those roles.
      </p>
      {body}
    </section>
  );
}
