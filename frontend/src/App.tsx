import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "@/components/shell/AppShell";
import { Empty, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { canSee } from "@/lib/roles";
const Login = lazy(() => import("@/pages/Login"));
import { Link } from "react-router";
import { MapPinOff } from "lucide-react";

const Overview = lazy(() => import("@/pages/Overview"));
const Timetable = lazy(() => import("@/pages/Timetable"));
const FindRoom = lazy(() => import("@/pages/FindRoom"));
const Book = lazy(() => import("@/pages/Book"));
const Spectra = lazy(() => import("@/pages/Spectra"));
const Changes = lazy(() => import("@/pages/Changes"));
const ChangeDetail = lazy(() => import("@/pages/ChangeDetail"));
const Approvals = lazy(() => import("@/pages/Approvals"));
const Exams = lazy(() => import("@/pages/Exams"));
const DataExport = lazy(() => import("@/pages/DataExport"));
const Settings = lazy(() => import("@/pages/Settings"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Each role only sees its own stops; a typed URL for another role's page explains instead of failing. */
function Stop({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user && !canSee(user.role, pathname)) {
    return (
      <Empty
        icon={<MapPinOff />}
        title="This page isn't on your line"
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to overview</Link>
          </Button>
        }
      >
        Your account can't open this page.{" "}
        {user.demo ? "Log in with a different demo account to see it." : "If you need it, ask an Admin to change your role."}
      </Empty>
    );
  }
  return <Suspense fallback={<Loading rows={8} />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Suspense fallback={<div className="min-h-dvh bg-platform" />}><Login /></Suspense>} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Stop><Overview /></Stop>} />
        <Route path="timetable" element={<Stop><Timetable /></Stop>} />
        <Route path="rooms" element={<Stop><FindRoom /></Stop>} />
        <Route path="book" element={<Stop><Book /></Stop>} />
        <Route path="spectra" element={<Stop><Spectra /></Stop>} />
        <Route path="changes" element={<Stop><Changes /></Stop>} />
        <Route path="changes/:id" element={<Stop><ChangeDetail /></Stop>} />
        <Route path="approvals" element={<Stop><Approvals /></Stop>} />
        <Route path="exams" element={<Stop><Exams /></Stop>} />
        <Route path="data" element={<Stop><DataExport /></Stop>} />
        <Route path="settings" element={<Stop><Settings /></Stop>} />
        <Route
          path="*"
          element={
            <Empty
              icon={<MapPinOff />}
              title="No page here"
              action={
                <Button asChild variant="primary">
                  <Link to="/">Go to overview</Link>
                </Button>
              }
            >
              The address doesn't match any page. Use the menu or press Ctrl K to search.
            </Empty>
          }
        />
      </Route>
    </Routes>
  );
}
