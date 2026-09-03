import type { ReactNode } from "react";
import Link from "next/link";
import { Archive, ArrowUpRight } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="noise min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            data-testid="link-home"
            className="group flex items-center gap-3"
          >
            <span className="grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-3">
              <Archive size={18} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[15px] font-bold tracking-[-0.02em] text-foreground">
                Roll Desk
              </span>
              <span className="hidden font-mono-app text-[9px] uppercase tracking-[.18em] text-muted-foreground sm:block">
                Public records, indexed
              </span>
            </span>
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-border/80 bg-card/45">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-mono-app uppercase tracking-[.12em]">
            Roll Desk · A public records utility
          </p>
          <a
            data-testid="link-source-note"
            href="https://eci.gov.in"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-accent"
          >
            Source & usage notes <ArrowUpRight size={12} />
          </a>
        </div>
      </footer>
    </div>
  );
}
