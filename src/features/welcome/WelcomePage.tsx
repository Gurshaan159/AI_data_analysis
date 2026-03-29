import { useEffect, useState } from "react";

import { APP_PAGES } from "@/app/routes";
import { ModeChoiceCard } from "@/components/ui/ModeChoiceCard";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { getBackendHealth } from "@/services/backend/backendHealthService";
import type { BackendHealthInfo } from "@/shared/types";
import { useAppState } from "@/state/useAppState";

export function WelcomePage() {
  const { dispatch } = useAppState();
  const [health, setHealth] = useState<BackendHealthInfo | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    void getBackendHealth()
      .then((result) => {
        setHealth(result);
      })
      .catch((error) => {
        setHealthError(String(error));
      });
  }, []);

  return (
    <PageShell
      title="Choose an Analysis Path"
      description="Start with a fixed established pipeline or use AI-assisted workflow selection."
    >
      {health ? (
        <StatusPanel title="Backend Health" tone={health.status === "ready" ? "success" : "warning"}>
          <p>Status: {health.status}</p>
          <p>AI provider: {health.aiProvider}</p>
        </StatusPanel>
      ) : null}
      {healthError ? (
        <StatusPanel title="Backend Health Unavailable" tone="warning">
          <p>{healthError}</p>
        </StatusPanel>
      ) : null}
      <div className="mode-grid">
        <ModeChoiceCard
          title="Run Established Analysis"
          description="Select an approved pipeline, provide files, and run a deterministic workflow."
          actionLabel="Start Established Path"
          onSelect={() => {
            dispatch({ type: "set-mode", mode: "established" });
            dispatch({ type: "set-page", page: APP_PAGES.ESTABLISHED_ANALYSIS });
          }}
        />
        <ModeChoiceCard
          title="AI-Assisted Analysis"
          description="Describe your question and review an AI-proposed supported workflow before running."
          actionLabel="Start AI-Assisted Path"
          onSelect={() => {
            dispatch({ type: "set-mode", mode: "ai-assisted" });
            dispatch({ type: "set-page", page: APP_PAGES.AI_ASSISTED_ANALYSIS });
          }}
        />
      </div>
    </PageShell>
  );
}
