import type { PropsWithChildren } from "react";

interface StatusPanelProps {
  title: string;
  tone?: "neutral" | "success" | "warning" | "error";
}

export function StatusPanel({ title, tone = "neutral", children }: PropsWithChildren<StatusPanelProps>) {
  return (
    <section className={`status-panel status-panel-${tone}`}>
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}
