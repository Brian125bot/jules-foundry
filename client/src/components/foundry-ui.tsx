import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, CircleDot, ExternalLink, PauseCircle, Radio, RefreshCw } from "lucide-react";
import { ReactNode } from "react";

export const healthStyle: Record<string, string> = { healthy: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", stale: "bg-amber-50 text-amber-700 ring-amber-600/15", attention: "bg-rose-50 text-rose-700 ring-rose-600/15", terminal: "bg-slate-100 text-slate-600 ring-slate-500/15" };
export const evidenceStyle: Record<string, string> = { proven: "bg-emerald-50 text-emerald-700", partial: "bg-amber-50 text-amber-700", unproven: "bg-slate-100 text-slate-600", contradicted: "bg-rose-50 text-rose-700" };
export const riskStyle: Record<string, string> = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-700" };

export function StatusPill({ value, kind = "health" }: { value: string; kind?: "health" | "evidence" | "risk" }) {
  const styles = kind === "health" ? healthStyle : kind === "evidence" ? evidenceStyle : riskStyle;
  const Icon = value === "healthy" || value === "proven" ? Check : value === "attention" || value === "contradicted" ? AlertTriangle : value === "stale" || value === "partial" ? PauseCircle : CircleDot;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ring-1", styles[value] ?? "bg-slate-100 text-slate-600 ring-slate-300")}><Icon className="h-3 w-3" />{value}</span>;
}

export function ConsoleHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="max-w-full overflow-hidden border-b border-slate-200 bg-white px-5 py-6 sm:px-8 lg:px-10"><div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col items-start justify-between gap-4 sm:flex-row sm:gap-5"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">{eyebrow}</p><h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{action && <div className="max-w-full shrink-0">{action}</div>}</div></header>;
}

export function MetricCard({ label, value, detail, tone = "cyan" }: { label: string; value: string | number; detail: string; tone?: "cyan" | "amber" | "rose" | "slate" }) {
  const colors = { cyan: "border-cyan-100 bg-cyan-50/70", amber: "border-amber-100 bg-amber-50/70", rose: "border-rose-100 bg-rose-50/70", slate: "border-slate-200 bg-white" };
  return <div className={cn("rounded-2xl border p-4 shadow-[0_8px_25px_-18px_rgba(15,23,42,0.35)]", colors[tone])}><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="relative isolate overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><div aria-hidden className="absolute inset-x-16 top-1/2 -z-10 hidden h-px border-t border-dashed border-cyan-200 md:block" /><div aria-hidden className="absolute left-[28%] top-[42%] -z-10 hidden h-11 w-px -rotate-45 border-l border-dashed border-cyan-200 md:block" /><div aria-hidden className="absolute right-[28%] top-[42%] -z-10 hidden h-11 w-px rotate-45 border-l border-dashed border-cyan-200 md:block" /><span aria-hidden className="absolute left-[22%] top-1/2 -z-10 hidden h-2.5 w-2.5 rounded-full border border-cyan-300 bg-cyan-50 md:block" /><span aria-hidden className="absolute right-[22%] top-1/2 -z-10 hidden h-2.5 w-2.5 rounded-full border border-cyan-300 bg-cyan-50 md:block" /><span aria-hidden className="absolute left-1/2 top-[36%] -z-10 hidden h-3 w-3 -translate-x-1/2 rounded-full border border-cyan-400 bg-white md:block" /><div className="relative mx-auto grid h-10 w-10 place-items-center rounded-xl border border-cyan-100 bg-cyan-50 text-cyan-700"><Radio className="h-5 w-5" /></div><p className="mt-3 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-cyan-700">Awaiting signal</p><h3 className="mt-2 text-sm font-semibold text-slate-900">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function ProviderLink({ href, label }: { href?: string | null; label: string }) {
  if (!href) return <span className="text-xs text-slate-400">{label}</span>;
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-900">{label}<ExternalLink className="h-3 w-3" /></a>;
}

export function ReconcileButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return <Button onClick={onClick} disabled={loading} variant="outline" className="border-slate-300 bg-white text-slate-700 shadow-sm"><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "Reconciling" : "Reconcile sessions"}</Button>;
}
