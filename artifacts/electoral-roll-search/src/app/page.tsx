import { AppShell } from "@/components/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import SearchPage from "@/components/pages/search";

export default function Page() {
  return (
    <AppShell>
      <ErrorBoundary resetKey="/">
        <SearchPage />
      </ErrorBoundary>
    </AppShell>
  );
}
