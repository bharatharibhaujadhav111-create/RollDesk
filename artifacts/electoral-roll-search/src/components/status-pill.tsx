import { CheckCircle2, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react';

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const isGood = ['ready', 'healthy', 'complete', 'completed', 'indexed', 'online'].some((word) => normalized.includes(word));
  const isBad = ['error', 'failed', 'offline'].some((word) => normalized.includes(word));
  const Icon = isBad ? TriangleAlert : isGood ? CheckCircle2 : normalized.includes('index') || normalized.includes('process') ? LoaderCircle : CircleDashed;
  return (
    <span data-testid={`status-${status}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-[.08em] ${isBad ? 'border-destructive/25 bg-destructive/8 text-destructive' : isGood ? 'border-emerald-700/20 bg-emerald-700/8 text-emerald-800' : 'border-accent/25 bg-accent/8 text-accent'}`}>
      <Icon size={12} className={normalized.includes('index') || normalized.includes('process') ? 'animate-spin' : ''} />
      {status}
    </span>
  );
}