import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="paper-grid flex min-h-[60dvh] w-full items-center justify-center bg-background px-5">
      <Card className="w-full max-w-md border-border bg-card shadow-[var(--shadow-md)]">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-accent" />
            <h1 className="text-2xl font-bold tracking-[-.04em] text-primary">
              Page not found
            </h1>
          </div>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            This desk doesn’t have a record for that address. Return to search
            to find what you need.
          </p>
          <Link
            href="/"
            data-testid="link-return-search"
            className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Return to search
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
