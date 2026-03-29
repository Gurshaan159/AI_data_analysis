import type { RunProgressState } from "@/shared/types";

interface RunProgressPanelProps {
  runProgress: RunProgressState;
}

export function RunProgressPanel({ runProgress }: RunProgressPanelProps) {
  return (
    <section className="stack">
      <p>
        Run ID: <strong>{runProgress.runId ?? "Not started"}</strong>
      </p>
      <p>
        Status: <strong>{runProgress.finalStatus}</strong>
      </p>
      <div className="stack">
        {runProgress.progressEvents.map((event) => (
          <article key={event.id} className="summary-card">
            <strong>{event.label}</strong>
            <p>{event.phase}</p>
            <p>{event.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
