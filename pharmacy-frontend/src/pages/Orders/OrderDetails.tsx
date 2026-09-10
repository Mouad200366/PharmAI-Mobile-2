import { useEffect, useMemo, useRef, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import StatusBadge from "../../components/StatusBadge";
import "./OrderDetails.css";

import { ordersApi } from "../../services/api";
import type {
  Order,
  ScanItemProgress,
} from "../../services/api";


type ScanFeedback = {
  type: "success" | "error";
  message: string;
};

function OrderDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [order, setOrder] =
    useState<Order | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [barcode, setBarcode] =
    useState("");

  const [scanning, setScanning] =
    useState(false);

  const [scanFeedback, setScanFeedback] =
    useState<ScanFeedback | null>(null);

  const [scanItems, setScanItems] =
    useState<ScanItemProgress[]>([]);

  const barcodeInputRef =
    useRef<HTMLInputElement | null>(null);

  // =========================================================
  // GET LOGGED-IN PHARMACY
  // =========================================================

  const storedUser =
    localStorage.getItem("pharmacyUser");

  const pharmacyUser = storedUser
    ? JSON.parse(storedUser)
    : null;

  const pharmacyId =
    pharmacyUser?.pharmacyId;

  // =========================================================
  // LOAD ORDER
  // =========================================================

  useEffect(() => {
    if (!pharmacyId) {
      setError(
        "Informations de la pharmacie introuvables. Veuillez vous reconnecter."
      );

      setLoading(false);
      return;
    }

    if (!id) {
      setError("Commande introuvable.");
      setLoading(false);
      return;
    }

    fetchOrder(Number(id));
  }, [id, pharmacyId]);

  useEffect(() => {
    if (
      order &&
      (order.status === "accepted" ||
        order.status === "preparing")
    ) {
      window.setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [order?.status]);

  // =========================================================
  // GET ONE ORDER
  // =========================================================

  const fetchOrder = async (
    orderId: number
  ) => {
    if (!pharmacyId) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data =
        await ordersApi.getOrder(
          pharmacyId,
          orderId
        );

      setOrder(data);

      setScanItems(
        data.items.map((item) => ({
          orderItemId: item.id,
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          quantity: item.quantity,
          scannedQuantity:
            item.scannedQuantity ?? 0,
          complete:
            (item.scannedQuantity ?? 0) >=
            item.quantity,
        }))
      );

    } catch (error) {
      console.error(
        "Order details error:",
        error
      );

      setError(
        "Impossible de récupérer les détails de la commande."
      );

    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // SCAN MEDICINE
  // =========================================================

  const scanMedicine = async () => {
    if (!order || !pharmacyId || scanning) {
      return;
    }

    const cleanedBarcode = barcode.trim();

    if (!cleanedBarcode) {
      setScanFeedback({
        type: "error",
        message:
          "Scannez ou saisissez un code-barres.",
      });
      barcodeInputRef.current?.focus();
      return;
    }

    try {
      setScanning(true);
      setScanFeedback(null);

      const result =
        await ordersApi.scanMedicine(
          pharmacyId,
          order.id,
          cleanedBarcode
        );

      setScanItems(result.items);

      setOrder((current) =>
        current
          ? {
              ...current,
              status: result.orderStatus,
              items: current.items.map((item) => {
                const progressItem =
                  result.items.find(
                    (scanItem) =>
                      scanItem.orderItemId ===
                      item.id
                  );

                return progressItem
                  ? {
                      ...item,
                      scannedQuantity:
                        progressItem.scannedQuantity,
                    }
                  : item;
              }),
            }
          : current
      );

      setScanFeedback({
        type: "success",
        message:
          result.orderStatus === "awaiting_agent"
            ? "Tous les médicaments sont vérifiés. La commande est prête et la recherche d'un livreur a démarré."
            : `${result.scannedMedicineName} validé avec succès.`,
      });

      setBarcode("");

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de valider ce code-barres.";

      setScanFeedback({
        type: "error",
        message,
      });

      setBarcode("");

    } finally {
      setScanning(false);

      window.setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    }
  };

  // =========================================================
  // PROGRESS
  // =========================================================

  const progress = useMemo(() => {
    const required = scanItems.reduce(
      (total, item) => total + item.quantity,
      0
    );

    const scanned = scanItems.reduce(
      (total, item) =>
        total + item.scannedQuantity,
      0
    );

    const percentage =
      required === 0
        ? 0
        : Math.round(
            (scanned * 100) / required
          );

    return {
      scanned,
      required,
      percentage,
    };
  }, [scanItems]);

  const scannerEnabled =
    order?.status === "accepted" ||
    order?.status === "preparing";

  // =========================================================
  // PAYMENT LABEL
  // =========================================================

  const getPaymentLabel = (
    paymentMethod: string
  ) => {
    switch (paymentMethod) {
      case "cash":
        return "Paiement à la livraison";
      case "card":
        return "Carte bancaire";
      default:
        return paymentMethod;
    }
  };

  // =========================================================
  // PRESCRIPTION LABEL
  // =========================================================

  const getPrescriptionLabel = (
    mode: string
  ) => {
    switch (mode) {
      case "none":
        return "Aucune ordonnance";
      case "upload":
        return "Ordonnance envoyée";
      case "manual":
        return "Ordonnance vérifiée";
      case "pickup":
        return "Ordonnance à récupérer";
      default:
        return mode;
    }
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div className="order-details-page">
          <div className="order-details-loading">
          <div className="loading-spinner"></div>
          <p>
            Chargement des détails de la commande...
          </p>
        </div>
      </div>
    );
  }

  // =========================================================
  // ERROR
  // =========================================================

  if (error || !order) {
    return (
      <div className="order-details-page">
          <div className="order-details-error">
          <div className="error-icon">!</div>
          <h2>Commande introuvable</h2>
          <p>
            {error ||
              "Cette commande n'existe pas."}
          </p>
          <button
            className="back-button"
            onClick={() => navigate("/orders")}
          >
            ← Retour aux commandes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-details-page">

      <main className="order-details-content">
        <button
          className="back-link"
          onClick={() => navigate("/orders")}
        >
          ← Retour aux commandes
        </button>

        <div className="details-heading">
          <div>
            <span className="details-eyebrow">
              DÉTAIL DE LA COMMANDE
            </span>
            <h1>Commande #{order.id}</h1>
            <p>
              Créée le{" "}
              {new Date(
                order.createdAt
              ).toLocaleString("fr-FR")}
            </p>
          </div>

          <StatusBadge
            status={order.status}
            className="details-status"
          />
        </div>

        <div className="details-grid">
          <div className="details-main">
            <section className="details-card">
              <div className="details-card-header">
                <div>
                  <span className="card-eyebrow">
                    CLIENT
                  </span>
                  <h2>Informations client</h2>
                </div>
              </div>

              <div className="customer-details">
                <div className="customer-avatar">C</div>
                <div>
                  <strong>
                    {order.customerName}
                  </strong>
                  <p>Commande #{order.id}</p>
                </div>
              </div>
            </section>

            {(scannerEnabled ||
              order.status === "ready_for_pickup" ||
              order.status === "awaiting_agent") && (
              <section className="details-card scanner-card">
                <div className="details-card-header scanner-card-header">
                  <div>
                    <span className="card-eyebrow">
                      PRÉPARATION
                    </span>
                    <h2>
                      Vérification par code-barres
                    </h2>
                  </div>

                  <strong className="scanner-percentage">
                    {progress.percentage}%
                  </strong>
                </div>

                <div className="scan-progress-summary">
                  <div className="scan-progress-copy">
                    <strong>
                      {progress.scanned} /{" "}
                      {progress.required}
                    </strong>
                    <span>
                      unités vérifiées
                    </span>
                  </div>

                  <div className="scan-progress-track">
                    <div
                      className="scan-progress-fill"
                      style={{
                        width: `${Math.min(
                          progress.percentage,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {scannerEnabled && (
                  <form
                    className="barcode-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      scanMedicine();
                    }}
                  >
                    <label htmlFor="barcode-input">
                      Scanner un médicament
                    </label>

                    <div className="barcode-input-row">
                      <div className="barcode-input-wrapper">
                        <span className="barcode-symbol">
                          ||||
                        </span>
                        <input
                          ref={barcodeInputRef}
                          id="barcode-input"
                          type="text"
                          autoComplete="off"
                          value={barcode}
                          onChange={(event) =>
                            setBarcode(
                              event.target.value
                            )
                          }
                          placeholder="Scannez ou saisissez le code-barres"
                          disabled={scanning}
                        />
                      </div>

                      <button
                        type="submit"
                        className="scan-submit-button"
                        disabled={scanning}
                      >
                        {scanning
                          ? "Validation..."
                          : "Valider"}
                      </button>
                    </div>

                    <p className="scanner-hint">
                      Le lecteur peut saisir le code puis envoyer Entrée automatiquement.
                    </p>
                  </form>
                )}

                {scanFeedback && (
                  <div
                    className={`scan-feedback ${scanFeedback.type}`}
                  >
                    <span>
                      {scanFeedback.type ===
                      "success"
                        ? "✓"
                        : "!"}
                    </span>
                    {scanFeedback.message}
                  </div>
                )}

                {(order.status === "ready_for_pickup" ||
                  order.status === "awaiting_agent") && (
                  <div className="scan-complete-banner">
                    <span>✓</span>
                    <div>
                      <strong>
                        Préparation terminée
                      </strong>
                      <p>
                        Tous les médicaments ont été vérifiés. La commande est prête et un livreur est en cours de recherche.
                      </p>
                    </div>
                  </div>
                )}

                <div className="scan-items-list">
                  {scanItems.map((item) => (
                    <div
                      className={`scan-item-row ${
                        item.complete
                          ? "complete"
                          : "pending"
                      }`}
                      key={item.orderItemId}
                    >
                      <div className="scan-item-state">
                        {item.complete
                          ? "✓"
                          : "○"}
                      </div>

                      <div className="scan-item-info">
                        <strong>
                          {item.medicineName}
                        </strong>
                        <span>
                          Quantité commandée :{" "}
                          {item.quantity}
                        </span>
                      </div>

                      <div className="scan-item-count">
                        <strong>
                          {item.scannedQuantity} /{" "}
                          {item.quantity}
                        </strong>
                        <span>
                          {item.complete
                            ? "Vérifié"
                            : "À scanner"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="details-card">
              <div className="details-card-header">
                <div>
                  <span className="card-eyebrow">
                    MÉDICAMENTS
                  </span>
                  <h2>
                    Articles de la commande
                  </h2>
                </div>
                <span className="items-count">
                  {order.items.length} article
                  {order.items.length !== 1
                    ? "s"
                    : ""}
                </span>
              </div>

              <div className="details-items">
                {order.items.map((item) => (
                  <div
                    className="details-item"
                    key={item.id}
                  >
                    <div className="medicine-icon">
                      +
                    </div>
                    <div className="medicine-info">
                      <strong>
                        {item.medicineName}
                      </strong>
                      <span>
                        Prix unitaire :{" "}
                        {Number(
                          item.unitPrice
                        ).toFixed(2)}{" "}
                        DH
                      </span>
                    </div>
                    <div className="medicine-quantity">
                      ×{item.quantity}
                    </div>
                    <div className="medicine-total">
                      {(
                        Number(item.unitPrice) *
                        item.quantity
                      ).toFixed(2)}{" "}
                      DH
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="details-card">
              <div className="details-card-header">
                <div>
                  <span className="card-eyebrow">
                    LIVRAISON
                  </span>
                  <h2>Adresse de livraison</h2>
                </div>
              </div>

              <div className="delivery-box">
                <div className="delivery-icon">◉</div>
                <div>
                  <strong>
                    Adresse du client
                  </strong>
                  <p>{order.deliveryAddress}</p>
                </div>
              </div>
            </section>

            {order.notes && (
              <section className="details-card">
                <div className="details-card-header">
                  <div>
                    <span className="card-eyebrow">
                      NOTES
                    </span>
                    <h2>
                      Instructions du client
                    </h2>
                  </div>
                </div>
                <div className="notes-box">
                  {order.notes}
                </div>
              </section>
            )}
          </div>

          <aside className="details-sidebar">
            <section className="details-card summary-card">
              <span className="card-eyebrow">
                RÉSUMÉ
              </span>
              <h2>Total de la commande</h2>

              <div className="summary-lines">
                <div>
                  <span>Sous-total</span>
                  <strong>
                    {Number(
                      order.itemsTotal
                    ).toFixed(2)}{" "}
                    DH
                  </strong>
                </div>
                <div>
                  <span>Livraison</span>
                  <strong>
                    {Number(
                      order.deliveryFee
                    ).toFixed(2)}{" "}
                    DH
                  </strong>
                </div>
              </div>

              <div className="summary-total">
                <span>Total</span>
                <strong>
                  {Number(
                    order.grandTotal
                  ).toFixed(2)}{" "}
                  DH
                </strong>
              </div>

              <div className="payment-method">
                <span>MODE DE PAIEMENT</span>
                <strong>
                  {getPaymentLabel(
                    order.paymentMethod
                  )}
                </strong>
              </div>
            </section>

            <section className="details-card">
              <span className="card-eyebrow">
                ORDONNANCE
              </span>
              <h2>Vérification</h2>

              <div className="prescription-status">
                <div className="prescription-icon">
                  ✓
                </div>
                <div>
                  <strong>
                    {getPrescriptionLabel(
                      order.prescriptionMode
                    )}
                  </strong>
                  <span>
                    Mode de prescription
                  </span>
                </div>
              </div>
            </section>

            <section className="details-card action-card">
              <span className="card-eyebrow">
                ACTION
              </span>
              <h2>Gestion de la commande</h2>

              {order.status === "pending_review" && (
                <button
                  className="details-primary-button"
                  onClick={async () => {
                    if (!order || !pharmacyId) return;
                    try {
                      const updated = await ordersApi.verifyPrescription(
                        pharmacyId,
                        order.id,
                        true,
                      );
                      setOrder(updated);
                    } catch (error) {
                      console.error("Prescription verification error:", error);
                      setError("Impossible d'approuver l'ordonnance.");
                    }
                  }}
                >
                  ✓ Approuver l'ordonnance
                </button>
              )}

              {order.status === "awaiting_agent" && (
                <div className="ready-box">
                  ✓ Commande prête — recherche d'un livreur en cours
                </div>
              )}

              {order.status === "accepted" && (
                <div className="preparation-action-box">
                  <strong>
                    Commencer la préparation
                  </strong>
                  <p>
                    Scannez le premier médicament. La commande passera automatiquement en préparation.
                  </p>
                </div>
              )}

              {order.status ===
                "preparing" && (
                <div className="preparation-action-box active">
                  <strong>
                    Préparation en cours
                  </strong>
                  <p>
                    Continuez à scanner jusqu'à 100 %. Le statut « Prête » sera appliqué automatiquement.
                  </p>
                </div>
              )}

              {order.status ===
                "ready_for_pickup" && (
                <div className="ready-box">
                  ✓ Cette commande est prête
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default OrderDetails;
