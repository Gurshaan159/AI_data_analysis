interface ModeChoiceCardProps {
  title: string;
  description: string;
  actionLabel: string;
  onSelect: () => void;
}

export function ModeChoiceCard({ title, description, actionLabel, onSelect }: ModeChoiceCardProps) {
  return (
    <article className="mode-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <button type="button" onClick={onSelect}>
        {actionLabel}
      </button>
    </article>
  );
}
