import { Workspace } from "./platform/Workspace";
import { useSession } from "./platform/session";
import { lazy, Suspense, useState, useEffect } from "react";
import { SpaceBackground } from "./components/SpaceBackground";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { PulseModal } from "./components/PulseModal";
import { OverviewView } from "./features/overview/OverviewView";
import { AnalyticsView } from "./features/analytics/AnalyticsView";
import { AlertsView } from "./features/alerts/AlertsView";
const DigitalTwinView = lazy(() =>
  import("./features/twin/DigitalTwin").then((m) => ({
    default: m.DigitalTwinView,
  })),
);
import { BehavioralHealthView } from "./features/behavioral/BehavioralHealthView";
import { MissionSetupView } from "./features/setup/MissionSetupView";
import { CockpitDataProvider } from "./api/CockpitData";
import type { ViewId } from "./components/NavPill";

export default function App() {
  const user = useSession();
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [activeCrew, setActiveCrew] = useState("okafor");
  const [pulseOpen, setPulseOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem("avia-theme");
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("avia-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  function renderView() {
    switch (activeView) {
      case "assistant":
        return (
          <Workspace
            key="assistant"
            crewId={activeCrew}
            initialTab="assistant"
            focused
            onCrewChange={setActiveCrew}
          />
        );
      case "tools":
        return (
          <Workspace
            key="tools"
            crewId={activeCrew}
            initialTab="guide"
            onCrewChange={setActiveCrew}
          />
        );
      case "overview":
        return <OverviewView onNavigate={setActiveView} />;
      case "twin":
        return <DigitalTwinView activeCrew={activeCrew} theme={theme} />;
      case "analytics":
        return <AnalyticsView activeCrew={activeCrew} theme={theme} />;
      case "alerts":
        return <AlertsView />;
      case "behavioral":
        return <BehavioralHealthView key={activeCrew} activeCrew={activeCrew} theme={theme} />;
      case "setup":
        return <MissionSetupView />;
      default:
        return <OverviewView />;
    }
  }

  if (user.role === "crew")
    return (
      <main className="crew-workspace">
        <nav className="bh-tabs crew-behavior-nav" aria-label="Crew workspace">
          <button aria-pressed={activeView !== "behavioral"} onClick={() => setActiveView("assistant")}>Health workspace</button>
          <button aria-pressed={activeView === "behavioral"} onClick={() => setActiveView("behavioral")}>Behavioral health</button>
          <button onClick={toggleTheme}>Switch theme</button>
        </nav>
        {activeView === "behavioral" ? <BehavioralHealthView activeCrew={user.crew} theme={theme} /> : <Workspace crewId={user.crew} initialTab="assistant" />}
      </main>
    );
  return (
    <CockpitDataProvider>
      <SpaceBackground theme={theme} />
      <div className="app-shell">
        <TopBar
          onPulseClick={() => setPulseOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onToggleSidebar={() => setMobileMenuOpen((prev) => !prev)}
        />

        <Sidebar
          activeCrew={activeCrew}
          onCrewSelect={setActiveCrew}
          activeView={activeView}
          onViewChange={(v) => {
            setActiveView(v);
            setMobileMenuOpen(false);
          }}
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onPulseClick={() => setPulseOpen(true)}
        />

        {mobileMenuOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="main-canvas" role="main" aria-label="Main view">
          {activeView === "overview" && (
            <div className="workspace-launch">
              <span>Your crew, in focus.</span>
              <button onClick={() => setActiveView("assistant")}>
                Ask A.V.I.A. <span aria-hidden="true">↗</span>
              </button>
              <button onClick={() => setActiveView("tools")}>
                Mission tools
              </button>
            </div>
          )}
          <Suspense fallback={<p role="status">Loading view…</p>}>
            {renderView()}
          </Suspense>
        </main>

        {pulseOpen && <PulseModal onClose={() => setPulseOpen(false)} />}
      </div>
    </CockpitDataProvider>
  );
}
