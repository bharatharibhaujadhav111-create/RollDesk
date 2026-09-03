import { AppShell } from "@/components/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import AdminPage from "@/components/pages/admin";

export default function Page() {
  return (
    <AppShell>
      <ErrorBoundary resetKey="/admin">
        <AdminPage />
      </ErrorBoundary>
    </AppShell>
  );
}
