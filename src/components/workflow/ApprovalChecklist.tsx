interface ApprovalChecklistProps {
  items: string[];
}

export function ApprovalChecklist({ items }: ApprovalChecklistProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="summary-card">
      <h4>Review Before Approval</h4>
      <ul className="checklist-list">
        {items.map((item) => (
          <li key={item} className="checklist-item">
            <span aria-hidden className="checklist-marker">
              [ ]
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
