import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

function StatCard({
  label,
  value,
  icon,
  hint,
  className = "",
}: StatCardProps) {
  return (
    <article className={className}>
      {icon && <div aria-hidden="true">{icon}</div>}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <div>{hint}</div>}
      </div>
    </article>
  );
}

export default StatCard;
