import DashboardLayout from "@/components/DashboardLayout";
import { ConsoleHeader, EmptyState, StatusPill } from "@/components/foundry-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDown, CircleDotDashed, GitBranch, Network, Plus, Sparkles, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type DeleteTarget = { id: number; title: string };

export default function Initiatives() {
  const [location, setLocation] = useLocation();
  const reviewDeleteId = Number(location.match(/^\/initiatives\/delete\/(\d+)$/)?.[1] ?? 0);
  const utils = trpc.useUtils();
  const [composerOpen, setComposerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(() => reviewDeleteId ? { id: reviewDeleteId, title: "" } : null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [baseSha, setBaseSha] = useState("");
  const [budget, setBudget] = useState("500");
  const initiatives = trpc.foundry.initiatives.list.useQuery();
  const deletePreview = trpc.foundry.initiatives.deletePreview.useQuery(
    { initiativeId: deleteTarget?.id ?? 0 },
    { enabled: Boolean(deleteTarget) },
  );
  const compile = trpc.foundry.initiatives.compile.useMutation({
    onSuccess: () => utils.foundry.initiatives.list.invalidate(),
    onError: error => toast.error("Compilation failed", { description: error.message }),
  });
  const create = trpc.foundry.initiatives.create.useMutation({
    onSuccess: async result => {
      toast.success("Initiative saved", { description: "Now compiling a bounded task graph from your request." });
      try {
        await compile.mutateAsync({ initiativeId: result.id });
        toast.success("Task graph compiled", { description: "Review the graph and dispatch order below." });
      } catch (error: any) {
        toast.error("Initiative saved, but compilation needs attention", { description: error.message });
      } finally {
        utils.foundry.initiatives.list.invalidate();
        setComposerOpen(false); setTitle(""); setPrompt("");
      }
    },
  });
  const remove = trpc.foundry.initiatives.remove.useMutation({
    onSuccess: async result => {
      await utils.foundry.initiatives.list.invalidate();
      toast.success("Initiative deleted", { description: `${result.deletedTaskCount} Foundry task record${result.deletedTaskCount === 1 ? "" : "s"} removed.` });
      setDeleteTarget(null); setDeleteConfirmation(""); setLocation("/initiatives");
    },
    onError: error => toast.error("Initiative was not deleted", { description: error.message }),
  });
  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ title, prompt, repository, branch, baseSha: baseSha || undefined, budgetCents: Number(budget) || 500 });
  };
  const submitDelete = (event: FormEvent) => {
    event.preventDefault();
    if (!deleteTarget) return;
    remove.mutate({ initiativeId: deleteTarget.id, confirmation: deleteConfirmation });
  };
  const closeDelete = () => { setDeleteTarget(null); setDeleteConfirmation(""); if (reviewDeleteId) setLocation("/initiatives"); };
  const activeSessions = deletePreview.data?.activeSessions ?? [];
  const canDelete = Boolean(deletePreview.data?.canDelete);
  useEffect(() => {
    if (!reviewDeleteId || !initiatives.data) return;
    const target = initiatives.data.find(initiative => initiative.id === reviewDeleteId);
    if (target && (deleteTarget?.id !== target.id || !deleteTarget.title)) setDeleteTarget({ id: target.id, title: target.title });
  }, [reviewDeleteId, deleteTarget, initiatives.data]);

  return (
    <DashboardLayout>
      <ConsoleHeader
        eyebrow="Planning / compiler workspace"
        title="Initiatives"
        description="Turn a natural-language request into bounded coding work. Gemini emits a typed graph; Foundry rejects unresolved dependencies and cycles before persistence."
        action={<Button onClick={() => setComposerOpen(true)} className="bg-slate-950 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" />New initiative</Button>}
      />
      <div className="mx-auto max-w-[1600px] space-y-7 p-5 sm:p-8 lg:p-10">
        {initiatives.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" /> : (initiatives.data ?? []).length === 0 ? (
          <EmptyState title="Start with a decision, not a raw agent prompt" description="Create an initiative to capture a repository context, branch, budget ceiling, and the natural-language request you want Foundry to decompose." action={<Button onClick={() => setComposerOpen(true)}><Sparkles className="mr-2 h-4 w-4" />Create first initiative</Button>} />
        ) : (initiatives.data ?? []).map(initiative => (
          <section key={initiative.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_-25px_rgba(15,23,42,0.3)]">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-slate-950">{initiative.title}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{initiative.status}</span></div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{initiative.prompt}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{initiative.repository}</span><span>{initiative.branch}</span><span>Budget ceiling ${(initiative.budgetCents / 100).toFixed(2)}</span></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-slate-500">{initiative.tasks.length} task{initiative.tasks.length === 1 ? "" : "s"}</span>
                {initiative.tasks.length === 0 && <Button onClick={() => compile.mutate({ initiativeId: initiative.id })} disabled={compile.isPending} variant="outline"><Sparkles className="mr-2 h-4 w-4" />Compile</Button>}
                <Button onClick={() => { setDeleteTarget({ id: initiative.id, title: initiative.title }); setDeleteConfirmation(""); }} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
              </div>
            </div>
            {initiative.tasks.length > 0 && <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
              <div className="overflow-x-auto"><div className="relative flex min-w-max items-start gap-3 pb-3">{initiative.tasks.slice().sort((a, b) => a.dispatchOrder - b.dispatchOrder).map((task, index) => <div key={task.id} className="flex items-center gap-3"><button onClick={() => setLocation(`/tasks/${task.id}`)} className="w-64 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white hover:shadow-md"><div className="flex items-start justify-between gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-xs font-semibold text-cyan-200">{task.dispatchOrder}</span><StatusPill value={task.riskTier} kind="risk" /></div><p className="mt-4 line-clamp-2 text-sm font-semibold text-slate-900">{task.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.description}</p><div className="mt-3 flex flex-wrap gap-1.5">{task.dependencies.length ? task.dependencies.map((dependency: string) => <span key={dependency} className="rounded-md border border-cyan-100 bg-cyan-50 px-1.5 py-1 text-[9px] font-medium text-cyan-800">← {dependency}</span>) : <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400"><CircleDotDashed className="h-3 w-3" />Entry point</span>}</div>{(task.reservationConflict || task.blockedReason) && <p className="mt-3 flex items-start gap-1 text-[10px] leading-4 text-rose-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{task.reservationConflict || task.blockedReason}</p>}</button>{index < initiative.tasks.length - 1 && <ArrowDown className="h-4 w-4 shrink-0 -rotate-90 text-cyan-600" />}</div>)}</div></div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><Network className="h-4 w-4" />Graph policy</div><p className="mt-2 text-xs leading-5 text-amber-800/80">Edges are resolved by task title and checked for cycles. Shared allowed paths become visible reservation conflicts before dispatch.</p><div className="mt-4 border-t border-amber-200/70 pt-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800/60">Aggregate status</p><p className="mt-1 text-sm font-semibold text-amber-900">{initiative.tasks.filter(task => ["review_ready", "closed"].includes(task.state)).length}/{initiative.tasks.length} review-ready</p><p className="mt-1 text-xs text-amber-800/75">{initiative.tasks.reduce((sum, task) => sum + task.evidenceDebt, 0)} criteria with evidence debt</p></div></div>
            </div>}
          </section>
        ))}
      </div>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Compose an initiative</DialogTitle><DialogDescription>Foundry will compile this request with Gemini into typed work packets. Existing provider credentials remain write-only and never enter the prompt.</DialogDescription></DialogHeader><form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="initiative-title">Initiative title</Label><Input id="initiative-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Harden session management" required /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="initiative-prompt">Natural-language request</Label><Textarea id="initiative-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Describe the user outcome, engineering constraints, and anything that must not change." className="min-h-32" required /></div><div className="space-y-2"><Label htmlFor="initiative-repo">GitHub repository</Label><Input id="initiative-repo" value={repository} onChange={event => setRepository(event.target.value)} placeholder="owner/repository" required /></div><div className="space-y-2"><Label htmlFor="initiative-branch">Target branch</Label><Input id="initiative-branch" value={branch} onChange={event => setBranch(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="initiative-sha">Base SHA <span className="font-normal text-slate-400">optional</span></Label><Input id="initiative-sha" value={baseSha} onChange={event => setBaseSha(event.target.value)} placeholder="Pinned revision" /></div><div className="space-y-2"><Label htmlFor="initiative-budget">Budget ceiling (cents)</Label><Input id="initiative-budget" type="number" min="10" value={budget} onChange={event => setBudget(event.target.value)} /></div><div className="sm:col-span-2"><Button type="submit" className="w-full bg-slate-950 text-white hover:bg-slate-800" disabled={create.isPending || compile.isPending}>{create.isPending || compile.isPending ? "Compiling task graph…" : "Create and compile"}</Button></div></form></DialogContent></Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => !open && closeDelete()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-800"><AlertTriangle className="h-5 w-5" />Delete initiative</DialogTitle><DialogDescription>This is a permanent Foundry deletion. Remote Jules sessions are never cancelled by this action.</DialogDescription></DialogHeader>{deletePreview.isLoading ? <div className="h-44 animate-pulse rounded-xl bg-slate-100" /> : <form onSubmit={submitDelete} className="space-y-5"><div className="rounded-xl border border-rose-100 bg-rose-50 p-4"><p className="text-sm font-semibold text-rose-900">{deleteTarget?.title}</p><p className="mt-1 text-xs leading-5 text-rose-800/80">This removes {deletePreview.data?.taskCount ?? 0} task record{deletePreview.data?.taskCount === 1 ? "" : "s"}, their mission events, attempts, approvals, and evidence from Foundry.</p></div>{activeSessions.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />Deletion is locked</p><p className="mt-2 text-xs leading-5 text-amber-800">{activeSessions.length} Jules session{activeSessions.length === 1 ? " is" : "s are"} still active. Wait for terminal status or resolve those sessions before deleting this initiative.</p><ul className="mt-3 space-y-1 text-xs text-amber-900">{activeSessions.map(session => <li key={session.id}>• {session.title}</li>)}</ul></div> : <><div className="space-y-2"><Label htmlFor="delete-confirmation">Type <span className="font-semibold text-slate-900">{deleteTarget?.title}</span> to confirm</Label><Input id="delete-confirmation" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} autoComplete="off" /></div><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={closeDelete}>Cancel</Button><Button type="submit" disabled={!canDelete || deleteConfirmation !== deleteTarget?.title || remove.isPending} className="bg-rose-700 text-white hover:bg-rose-800"><Trash2 className="mr-2 h-4 w-4" />{remove.isPending ? "Deleting…" : "Delete initiative"}</Button></div></>}</form>}</DialogContent></Dialog>
    </DashboardLayout>
  );
}
