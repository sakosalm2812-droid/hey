import { lazy, Suspense, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";

import ConnectionNotice from "./components/ConnectionNotice.jsx";
import Intro from "./components/Intro/Intro";
import IdleScreensaver from "./components/IdleScreensaver";
import CommandPalette from "./components/CommandPalette";
import TutorialOverlay from "./components/tutorials/TutorialOverlay";
import AppErrorBoundary from "./components/AppErrorBoundary";

// Layouts
import PublicLayout from "./components/layout/PublicLayout";
import AppLayout from "./components/layout/AppLayout";

// Auth
import ProtectedRoute from "./ProtectedRoute";
import LoginPage from "./LoginPage";
import SignupPage from "./SignupPage";
import ResetPasswordPage from "./ResetPasswordPage";

// Public Pages
const Home = lazy(() => import("./pages/Home.jsx"));
const Features = lazy(() => import("./pages/Features.jsx"));
const Customization = lazy(() => import("./pages/Customization.jsx"));
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const LivePage = lazy(() => import("./pages/Live.jsx"));
const CreatePage = lazy(() => import("./pages/Create.jsx"));
const DownloadPage = lazy(() => import("./pages/Download.jsx"));

// App Pages
const StudioPage = lazy(() => import("./StudioPage.jsx"));
const Dashboard = lazy(() => import("./Dashboard.jsx"));
const ChatPage = lazy(() => import("./ChatPage.jsx"));
const CosmosPage = lazy(() => import("./CosmosPage.jsx"));
const ForgePage = lazy(() => import("./ForgePage.jsx"));
const MemoryPage = lazy(() => import("./MemoryPage.jsx"));
const CalendarPage = lazy(() => import("./CalendarPage.jsx"));
const DeenPage = lazy(() => import("./pages/DeenPage.jsx"));
const TasksPage = lazy(() => import("./TasksPage.jsx"));
const LearnPage = lazy(() => import("./LearnPage.jsx"));
const AgentsPage = lazy(() => import("./AgentsPage.jsx"));
const AnalyticsPage = lazy(() => import("./AnalyticsPage.jsx"));
const FinancePage = lazy(() => import("./FinancePage.jsx"));
const GoalsPage = lazy(() => import("./GoalsPage.jsx"));
const HabitsPage = lazy(() => import("./HabitsPage.jsx"));
const HealthPage = lazy(() => import("./HealthPage.jsx"));
const JournalPage = lazy(() => import("./JournalPage.jsx"));
const NotesPage = lazy(() => import("./NotesPage.jsx"));
const ProjectsPage = lazy(() => import("./ProjectsPage.jsx"));
const MorningMode = lazy(() => import("./MorningMode.jsx"));
const CrisisMode = lazy(() => import("./CrisisMode.jsx"));
const ModesPage = lazy(() => import("./pages/ModesPage.jsx"));
const SettingsPage = lazy(() => import("./SettingsPage.jsx"));
const PermissionsPage = lazy(() => import("./PermissionsPage.jsx"));
const CapabilitiesPage = lazy(() => import("./CapabilitiesPage.jsx"));
const DeviceCenterPage = lazy(() => import("./DeviceCenterPage.jsx"));
const DebugPage = lazy(() => import("./DebugPage.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const ErrorPage = lazy(() => import("./pages/ErrorPages.jsx").then((module) => ({ default: module.default })));
const LegalPage = lazy(() => import("./pages/Legal.jsx"));
const SupportPage = lazy(() => import("./pages/Support.jsx"));


function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}


function PublicPage({ children }) {
  return (
    <PublicLayout>
      {children}
    </PublicLayout>
  );
}


function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* PUBLIC */}
        <Route
          path="/"
          element={
            <PublicPage>
              <Home />
            </PublicPage>
          }
        />

        <Route
          path="/features"
          element={
            <PublicPage>
              <Features />
            </PublicPage>
          }
        />

        <Route
          path="/voice"
          element={<Navigate to="/chat" replace />}
        />

        <Route
          path="/customization"
          element={
            <PublicPage>
              <Customization />
            </PublicPage>
          }
        />

        <Route
          path="/pricing"
          element={
            <PublicPage>
              <Pricing />
            </PublicPage>
          }
        />

        <Route path="/privacy" element={<PublicPage><LegalPage document="privacy" /></PublicPage>} />
        <Route path="/terms" element={<PublicPage><LegalPage document="terms" /></PublicPage>} />
        <Route path="/support" element={<PublicPage><SupportPage /></PublicPage>} />

        <Route
          path="/live"
          element={
            <PublicPage>
              <LivePage />
            </PublicPage>
          }
        />

        <Route
          path="/create"
          element={
            <PublicPage>
              <CreatePage />
            </PublicPage>
          }
        />

        <Route
          path="/download"
          element={
            <PublicPage>
              <DownloadPage />
            </PublicPage>
          }
        />

        {/* AUTH */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* PROTECTED APP */}
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />

        <Route
          path="/chat"
          element={
            <ProtectedLayout>
              <ChatPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/voice/live"
          element={<Navigate to="/chat" replace />}
        />

        <Route
          path="/cosmos"
          element={
            <ProtectedLayout>
              <CosmosPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/forge"
          element={
            <ProtectedLayout>
              <ForgePage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/memory"
          element={
            <ProtectedLayout>
              <MemoryPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedLayout>
              <CalendarPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/deen"
          element={
            <ProtectedLayout>
              <DeenPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/tasks"
          element={
            <ProtectedLayout>
              <TasksPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/learn"
          element={
            <ProtectedLayout>
              <LearnPage />
            </ProtectedLayout>
          }
        />

        <Route path="/studio" element={<ProtectedLayout><StudioPage /></ProtectedLayout>} />
        <Route path="/agents" element={<ProtectedLayout><AgentsPage /></ProtectedLayout>} />
        <Route path="/analytics" element={<ProtectedLayout><AnalyticsPage /></ProtectedLayout>} />
        <Route path="/finance" element={<ProtectedLayout><FinancePage /></ProtectedLayout>} />
        <Route path="/goals" element={<ProtectedLayout><GoalsPage /></ProtectedLayout>} />
        <Route path="/habits" element={<ProtectedLayout><HabitsPage /></ProtectedLayout>} />
        <Route path="/health" element={<ProtectedLayout><HealthPage /></ProtectedLayout>} />
        <Route path="/journal" element={<ProtectedLayout><JournalPage /></ProtectedLayout>} />
        <Route path="/notes" element={<ProtectedLayout><NotesPage /></ProtectedLayout>} />
        <Route path="/projects" element={<ProtectedLayout><ProjectsPage /></ProtectedLayout>} />

        <Route
          path="/morning"
          element={
            <ProtectedLayout>
              <MorningMode />
            </ProtectedLayout>
          }
        />

        <Route
          path="/crisis"
          element={
            <ProtectedLayout>
              <CrisisMode />
            </ProtectedLayout>
          }
        />

        <Route
          path="/modes"
          element={
            <ProtectedLayout>
              <ModesPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedLayout>
              <SettingsPage />
            </ProtectedLayout>
          }
        />
        <Route path="/permissions" element={<ProtectedLayout><PermissionsPage /></ProtectedLayout>} />
        <Route path="/capabilities" element={<ProtectedLayout><CapabilitiesPage /></ProtectedLayout>} />
        <Route path="/device" element={<ProtectedLayout><DeviceCenterPage /></ProtectedLayout>} />
        <Route path="/debug" element={<ProtectedLayout><DebugPage /></ProtectedLayout>} />

        <Route path="/error/401" element={<PublicPage><ErrorPage code="401" /></PublicPage>} />
        <Route path="/error/403" element={<PublicPage><ErrorPage code="403" /></PublicPage>} />
        <Route path="/error/429" element={<PublicPage><ErrorPage code="429" /></PublicPage>} />
        <Route path="/error/500" element={<PublicPage><ErrorPage code="500" /></PublicPage>} />

        {/* FALLBACK */}
        <Route
          path="*"
          element={<PublicPage><NotFound /></PublicPage>}
        />
      </Routes>
    </AnimatePresence>
  );
}


export default function App() {
  const [showIntro, setShowIntro] = useState(() => {
    try { return window.location.pathname === "/" && localStorage.getItem("hey_intro_seen") !== "true"; } catch { return false; }
  });


  const finishIntro = () => {
    try { localStorage.setItem("hey_intro_seen", "true"); } catch { /* Continue when storage is unavailable. */ }
    setShowIntro(false);
  };


  if (showIntro) {
    return (
      <MotionConfig reducedMotion="user">
        <Intro finish={finishIntro} />
      </MotionConfig>
    );
  }


  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Suspense fallback={<div className="hey-route-loading"><span className="hey-script">HEY</span><small>loading your world</small></div>}>
            <AnimatedRoutes />
          </Suspense>
          <ConnectionNotice />
          <CommandPalette />
          <TutorialOverlay />
          <IdleScreensaver />
        </BrowserRouter>
      </MotionConfig>
    </AppErrorBoundary>
  );
}
