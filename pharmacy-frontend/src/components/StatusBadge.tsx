interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Paiement en attente",
  pending_review: "Ordonnance à vérifier",
  rejected: "Rejetée",
  accepted: "Acceptée",
  preparing: "En préparation",
  ready_for_pickup: "Prête",
  awaiting_agent: "En attente du livreur",
  picked_up: "Récupérée",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase() ?? "";
  const label = STATUS_LABELS[normalizedStatus] ?? status;

  return (
    <span
      className={`${className} ${normalizedStatus}`.trim()}
      data-status={normalizedStatus}
    >
      {label}
    </span>
  );
}

export default StatusBadge;
