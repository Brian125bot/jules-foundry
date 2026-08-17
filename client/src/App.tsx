import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Credentials from "./pages/Credentials";
import Fleet from "./pages/Fleet";
import Home from "./pages/Home";
import Initiatives from "./pages/Initiatives";
import TaskDetail from "./pages/TaskDetail";

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/fleet" component={Fleet} /><Route path="/initiatives/delete/:id" component={Initiatives} /><Route path="/initiatives" component={Initiatives} /><Route path="/credentials" component={Credentials} /><Route path="/tasks/:id" component={TaskDetail} /><Route component={NotFound} /></Switch>; }
function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;
