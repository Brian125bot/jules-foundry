import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const Credentials = lazy(() => import("./pages/Credentials"));
const Fleet = lazy(() => import("./pages/Fleet"));
const Initiatives = lazy(() => import("./pages/Initiatives"));
const LocalOperations = lazy(() => import("./pages/LocalOperations"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));

function Router() { return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f5f7fb] text-sm font-medium text-slate-500">Loading local workspace…</div>}><Switch><Route path="/" component={Home} /><Route path="/fleet" component={Fleet} /><Route path="/initiatives/delete/:id" component={Initiatives} /><Route path="/initiatives" component={Initiatives} /><Route path="/credentials" component={Credentials} /><Route path="/local" component={LocalOperations} /><Route path="/tasks/:id" component={TaskDetail} /><Route component={NotFound} /></Switch></Suspense>; }
function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;
