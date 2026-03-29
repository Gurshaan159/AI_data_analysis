import type { PropsWithChildren } from "react";

interface PageShellProps {
  title: string;
  description: string;
}

export function PageShell({
  title,
  description,
  children,
}: PropsWithChildren<PageShellProps>) {
  return (
    <section className="page-shell">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="page-content">{children}</div>
    </section>
  );
}
