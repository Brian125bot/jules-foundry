import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { Activity, Bot, Boxes, CheckCircle2, ChevronRight, CircleHelp, GitPullRequest, KeyRound, LayoutDashboard, MonitorCheck, PanelLeft, Radar, ShieldCheck, Workflow } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Command center", path: "/" },
  { icon: Radar, label: "Fleet observatory", path: "/fleet" },
  { icon: Boxes, label: "Initiatives", path: "/initiatives" },
  { icon: KeyRound, label: "Credential vault", path: "/credentials" },
  { icon: ShieldCheck, label: "Local operations", path: "/local" },
];
const SIDEBAR_WIDTH_KEY = "jules-foundry-sidebar-width";
const DEFAULT_WIDTH = 272;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)), [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="grid min-h-screen place-items-center bg-[#0b1020] p-6 text-white"><div className="max-w-md text-center"><div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300 text-slate-950"><Bot className="h-7 w-7" /></div><h1 className="text-3xl font-semibold">Jules Foundry</h1><p className="mt-3 text-sm leading-6 text-slate-300">This trusted-machine runtime needs its one-time local browser session. Restart Foundry to open a new local session if this page was opened directly or the session expired.</p></div></div>;
  }
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (value: number) => void }) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const [aboutOpen, setAboutOpen] = useState(() => new URLSearchParams(window.location.search).get("about") === "1");
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onMove = (event: MouseEvent) => { if (!isResizing) return; const left = sidebarRef.current?.getBoundingClientRect().left ?? 0; const width = event.clientX - left; if (width >= 220 && width <= 380) setSidebarWidth(width); };
    const onUp = () => setIsResizing(false);
    if (isResizing) { document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); document.body.style.cursor = "col-resize"; }
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; };
  }, [isResizing, setSidebarWidth]);
  const active = menuItems.find(item => location === item.path) ?? (location.startsWith("/tasks") ? { label: "Mission detail" } : menuItems[0]);
  return <>
    <div ref={sidebarRef} className="relative">
      <Sidebar collapsible="icon" className="border-r border-white/10 bg-[#0b1020] text-slate-200" disableTransition={isResizing}>
        <SidebarHeader className="h-[86px] justify-center px-3"><div className="flex items-center gap-3"><button onClick={toggleSidebar} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300 transition hover:bg-white/10" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white"><span className="grid h-5 w-5 place-items-center rounded-md bg-cyan-300 text-slate-950"><Bot className="h-3.5 w-3.5" /></span>Jules Foundry</div><p className="mt-1 text-[10px] font-medium uppercase tracking-[0.17em] text-cyan-300/70">Orchestration console</p></div>}</div></SidebarHeader>
        <SidebarContent className="px-2 pt-3"><p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500 group-data-[collapsible=icon]:hidden">Workspace</p><SidebarMenu>{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl text-slate-300 hover:bg-white/7 hover:text-white data-[active=true]:bg-cyan-300/12 data-[active=true]:text-cyan-200"><item.icon className="h-4 w-4" /><span>{item.label}</span>{!isCollapsed && location === item.path && <ChevronRight className="ml-auto h-3.5 w-3.5" />}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
          {!isCollapsed && <div className="mx-2 mt-8 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-3.5"><div className="flex items-center gap-2 text-xs font-medium text-cyan-100"><Activity className="h-3.5 w-3.5 text-cyan-300" /> Monitoring protocol</div><p className="mt-2 text-[11px] leading-5 text-slate-400">Each dispatch, poll, activity, and verdict is preserved in the mission ledger while this local application is running.</p></div>}</SidebarContent>
        <SidebarFooter className="space-y-2 p-3"><Button variant="ghost" onClick={() => setAboutOpen(true)} className="h-10 w-full justify-start rounded-xl px-3 text-slate-300 hover:bg-white/7 hover:text-white" aria-label="About and how to use Jules Foundry"><CircleHelp className="h-4 w-4 shrink-0" /><span className="ml-2 group-data-[collapsible=icon]:hidden">About &amp; how to use</span></Button><div className="flex w-full items-center gap-3 rounded-xl p-2 text-left"><Avatar className="h-8 w-8 border border-white/10"><AvatarFallback className="bg-slate-800 text-xs text-cyan-200">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-medium text-white">{user?.name || "Local operator"}</p><p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-cyan-300/70"><MonitorCheck className="h-3 w-3" />Trusted-machine local runtime</p></div></div></SidebarFooter>
      </Sidebar>
      {!isCollapsed && <div className="absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-cyan-300/35" onMouseDown={() => setIsResizing(true)} />}
    </div>
    <SidebarInset className="min-h-screen min-w-0 max-w-full overflow-x-hidden bg-[#f5f7fb]">{isMobile && <div className="sticky top-0 z-40 flex h-14 min-w-0 items-center gap-3 border-b bg-white/90 px-3 backdrop-blur"><SidebarTrigger className="rounded-lg" /><span className="truncate text-sm font-medium">{active.label}</span></div>}<main className="min-h-screen min-w-0 max-w-full overflow-x-hidden">{children}</main></SidebarInset>
    <Dialog open={aboutOpen} onOpenChange={setAboutOpen}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-slate-200 bg-white p-0"><DialogHeader className="border-b border-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-6 py-6 text-white"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 text-slate-950"><Bot className="h-5 w-5" /></span><div><DialogTitle className="text-xl text-white">About Jules Foundry</DialogTitle><DialogDescription className="mt-1 text-sm leading-6 text-slate-300">A local-first orchestration console for turning bounded intent into reviewable Jules coding sessions.</DialogDescription></div></div></DialogHeader><div className="space-y-6 px-6 py-6"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">How to use the Foundry</p><h2 className="mt-1 text-lg font-semibold text-slate-950">A governed path from intent to evidence</h2></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-4"><KeyRound className="h-4 w-4 text-cyan-700" /><h3 className="mt-3 text-sm font-semibold text-slate-900">1. Configure credentials</h3><p className="mt-1 text-xs leading-5 text-slate-600">Add and test write-only Jules, Gemini, and GitHub credentials in the Credential vault. Values are never returned to the browser.</p></div><div className="rounded-2xl border border-slate-200 p-4"><Workflow className="h-4 w-4 text-cyan-700" /><h3 className="mt-3 text-sm font-semibold text-slate-900">2. Compose an initiative</h3><p className="mt-1 text-xs leading-5 text-slate-600">Select a Gemini planning model, define the repository and branch, then compile the request into a bounded task graph with acceptance criteria.</p></div><div className="rounded-2xl border border-slate-200 p-4"><GitPullRequest className="h-4 w-4 text-cyan-700" /><h3 className="mt-3 text-sm font-semibold text-slate-900">3. Dispatch and supervise</h3><p className="mt-1 text-xs leading-5 text-slate-600">Open a mission, review its scope and plan gate, then explicitly dispatch to Jules. The Session Command Deck records every operator control and provider observation.</p></div><div className="rounded-2xl border border-slate-200 p-4"><CheckCircle2 className="h-4 w-4 text-cyan-700" /><h3 className="mt-3 text-sm font-semibold text-slate-900">4. Verify evidence</h3><p className="mt-1 text-xs leading-5 text-slate-600">Use the Quality Mesh and evidence ledger to map outputs to acceptance criteria before treating a terminal session as an accepted result.</p></div></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><ShieldCheck className="h-4 w-4" />Operator authority stays explicit</div><p className="mt-2 text-xs leading-5 text-amber-800">Foundry can compile prompts, monitor sessions, and assess evidence, but it does not silently approve plans, merge code, delete sessions, or redispatch work. Deterministic checks and your review remain authoritative.</p></div><div className="flex justify-end"><Button onClick={() => setAboutOpen(false)} className="bg-slate-950 text-white hover:bg-slate-800">Start in Credential vault</Button></div></div></DialogContent></Dialog>
  </>;
}
