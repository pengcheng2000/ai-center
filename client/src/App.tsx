import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./_core/hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AIAssistantBall from "./components/AIAssistantBall";
import Home from "./pages/Home";
import LearningCenter from "./pages/LearningCenter";
import Login from "./pages/Login";
import LearningPathDetail from "./pages/LearningPathDetail";
import NewsArticle from "./pages/NewsArticle";
import NewsCenter from "./pages/NewsCenter";
import NotFound from "./pages/NotFound";
import Operations from "./pages/Operations";
import Community from "./pages/Community";
import CourseDetail from "./pages/CourseDetail";
import PostDetail from "./pages/PostDetail";
import Profile from "./pages/Profile";
import GovernanceCenter from "./pages/GovernanceCenter";
import ContentOperations from "./pages/ContentOperations";
import ResourceLifecycleCenter from "./pages/ResourceLifecycleCenter";
import ApplicationCenter from "./pages/ApplicationCenter";
import ApplicationOperations from "./pages/ApplicationOperations";
import SkillsHub from "./pages/SkillsHub";
import SkillDetail from "./pages/SkillDetail";
import SkillSubmit from "./pages/SkillSubmit";
import SkillsOperations from "./pages/SkillsOperations";
import SkillsDirectImport from "./pages/SkillsDirectImport";
import AgentImportOperations from "./pages/AgentImportOperations";
import CommunityOperations from "./pages/CommunityOperations";

function MemberRoutes() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user || typeof window === "undefined") return;
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, user]);

  if (loading || !user) return <div className="grid min-h-screen place-items-center bg-[#f6f6f3]" aria-label="正在验证登录状态"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>;
  return <><Switch><Route path="/" component={Home} /><Route path="/learn" component={LearningCenter} /><Route path="/learn/:pathId/course/:courseId" component={CourseDetail} /><Route path="/learn/:id" component={LearningPathDetail} /><Route path="/news" component={NewsCenter} /><Route path="/news/:id" component={NewsArticle} /><Route path="/community" component={Community} /><Route path="/community/new" component={Community} /><Route path="/community/:id" component={PostDetail} /><Route path="/apps" component={ApplicationCenter} /><Route path="/skills/submit" component={SkillSubmit} /><Route path="/skills/:id" component={SkillDetail} /><Route path="/skills" component={SkillsHub} /><Route path="/me" component={Profile} /><Route path="/operations" component={Operations} /><Route path="/operations/governance" component={GovernanceCenter} /><Route path="/operations/content" component={ContentOperations} /><Route path="/operations/lifecycle" component={ResourceLifecycleCenter} /><Route path="/operations/apps" component={ApplicationOperations} /><Route path="/operations/community" component={CommunityOperations} /><Route path="/operations/skills/import" component={SkillsDirectImport} /><Route path="/operations/skills" component={SkillsOperations} /><Route path="/operations/agent-imports" component={AgentImportOperations} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch><AIAssistantBall /></>;
}

function Router() { return <Switch><Route path="/login" component={Login} /><Route><MemberRoutes /></Route></Switch>; }

function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-center" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;
