import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Activity, Bot, Boxes, Cable, ChevronRight, KeyRound, LayoutDashboard, LogOut, PanelLeft, Radar } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Command center", path: "/" },
  { icon: Radar, label: "Fleet observatory", path: "/fleet" },
  { icon: Boxes, label: "Initiatives", path: "/initiatives" },
  { icon: KeyRound, label: "Credential vault", path: "/credentials" },
];
const SIDEBAR_WIDTH_KEY = "jules-foundry-sidebar-width";
const DEFAULT_WIDTH = 272;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)), [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="grid min-h-screen place-items-center bg-[#0b1020] p-6 text-white"><div className="max-w-md text-center"><div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300 text-slate-950"><Bot className="h-7 w-7" /></div><h1 className="text-3xl font-semibold">Jules Foundry</h1><p className="mt-3 text-sm leading-6 text-slate-300">Sign in to access your private orchestration workspace and write-only credential vault.</p><Button onClick={() => startLogin()} className="mt-7 bg-cyan-300 text-slate-950 hover:bg-cyan-200">Sign in to Foundry</Button></div></div>;
  }
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (value: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
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
          {!isCollapsed && <div className="mx-2 mt-8 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-3.5"><div className="flex items-center gap-2 text-xs font-medium text-cyan-100"><Activity className="h-3.5 w-3.5 text-cyan-300" /> Monitoring protocol</div><p className="mt-2 text-[11px] leading-5 text-slate-400">Each dispatch, poll, activity, and verdict is preserved in the mission ledger.</p></div>}</SidebarContent>
        <SidebarFooter className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/6"><Avatar className="h-8 w-8 border border-white/10"><AvatarFallback className="bg-slate-800 text-xs text-cyan-200">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-medium text-white">{user?.name || "Operator"}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">Private workspace</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={logout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter>
      </Sidebar>
      {!isCollapsed && <div className="absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-cyan-300/35" onMouseDown={() => setIsResizing(true)} />}
    </div>
    <SidebarInset className="min-h-screen min-w-0 max-w-full overflow-x-hidden bg-[#f5f7fb]">{isMobile && <div className="sticky top-0 z-40 flex h-14 min-w-0 items-center gap-3 border-b bg-white/90 px-3 backdrop-blur"><SidebarTrigger className="rounded-lg" /><span className="truncate text-sm font-medium">{active.label}</span></div>}<main className="min-h-screen min-w-0 max-w-full overflow-x-hidden">{children}</main></SidebarInset>
  </>;
}
