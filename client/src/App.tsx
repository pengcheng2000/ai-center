import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
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

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/login" component={Login} /><Route path="/learn" component={LearningCenter} /><Route path="/learn/:pathId/course/:courseId" component={CourseDetail} /><Route path="/learn/:id" component={LearningPathDetail} /><Route path="/news" component={NewsCenter} /><Route path="/news/:id" component={NewsArticle} /><Route path="/community" component={Community} /><Route path="/community/new" component={Community} /><Route path="/community/:id" component={PostDetail} /><Route path="/apps" component={ApplicationCenter} /><Route path="/skills/submit" component={SkillSubmit} /><Route path="/skills/:id" component={SkillDetail} /><Route path="/skills" component={SkillsHub} /><Route path="/me" component={Profile} /><Route path="/operations" component={Operations} /><Route path="/operations/governance" component={GovernanceCenter} /><Route path="/operations/content" component={ContentOperations} /><Route path="/operations/lifecycle" component={ResourceLifecycleCenter} /><Route path="/operations/apps" component={ApplicationOperations} /><Route path="/operations/skills/import" component={SkillsDirectImport} /><Route path="/operations/skills" component={SkillsOperations} /><Route path="/operations/agent-imports" component={AgentImportOperations} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-center" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;
