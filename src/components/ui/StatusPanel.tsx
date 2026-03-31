import type { PropsWithChildren } from "react";

interface StatusPanelProps {
  title: string;
  tone?: "neutral" | "success" | "warning" | "error";
}

export function StatusPanel({ title, tone = "neutral", children }: PropsWithChildren<StatusPanelProps>) {
  const toneClass = tone === "neutral" ? "status-panel-neutral" : `status-panel-${tone}`;
  return (
    <section className={`status-panel ${toneClass}`}>
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}
