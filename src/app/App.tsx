import { AppRouter } from "@/app/AppRouter";
import { FlowProgress } from "@/components/ui/FlowProgress";
import { useAppState } from "@/state/useAppState";
import "@/styles/app.css";

export function App() {
  const { state } = useAppState();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Biology Analysis Desktop</h1>
        <p>Deterministic workflows with optional AI workflow support.</p>
        <FlowProgress currentPage={state.currentPage} mode={state.selectedMode} />
      </header>
      <main className="app-main">
        <AppRouter />
      </main>
    </div>
  );
}
