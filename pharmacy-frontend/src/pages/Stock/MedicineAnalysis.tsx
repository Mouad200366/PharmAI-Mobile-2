import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { aiApi } from "../../services/api";
import type { StockPrediction } from "../../services/api";


import "./MedicineAnalysis.css";

const storedUser = localStorage.getItem("pharmacyUser");

const pharmacyUser = storedUser
  ? JSON.parse(storedUser)
  : null;

const pharmacyId = pharmacyUser?.pharmacyId;

function MedicineAnalysis() {
  const { medicineId } = useParams();

  const [prediction, setPrediction] =
    useState<StockPrediction | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMedicineAnalysis();
  }, [medicineId]);

  const loadMedicineAnalysis = async () => {
    try {
      setLoading(true);
      setError("");

      if (!pharmacyId) {
  setError("Session utilisateur introuvable.");
  return;
}

const predictions =
  await aiApi.getStockPredictions(pharmacyId);

      const medicine = predictions.find(
        (item) =>
          String(item.medicineId) === String(medicineId)
      );

      if (!medicine) {
        setError(
          "Aucune analyse disponible pour ce médicament."
        );
        setPrediction(null);
        return;
      }

      setPrediction(medicine);

    } catch (error) {
      console.error(
        "Erreur analyse médicament:",
        error
      );

      setError(
        "Impossible de récupérer l'analyse du médicament."
      );
    } finally {
      setLoading(false);
    }
  };

  const getAlertInfo = (
    alertType: string
  ) => {
    switch (alertType) {

      case "CRITICAL":
        return {
          label: "Niveau critique",
          className: "critical",
          icon: "⚠",
        };

      case "LOW_STOCK":
        return {
          label: "Stock faible",
          className: "low",
          icon: "⏳",
        };

      case "HIGH_DEMAND":
        return {
          label: "Forte demande",
          className: "high-demand",
          icon: "📈",
        };

      case "OVERSTOCK":
        return {
          label: "Surstock",
          className: "overstock",
          icon: "📦",
        };

      case "SLOW_MOVING":
        return {
          label: "Faible rotation",
          className: "slow-moving",
          icon: "📉",
        };

      default:
        return {
          label: "Analyse disponible",
          className: "default",
          icon: "ℹ",
        };
    }
  };

  const formatWeeksOfStock = (
    weeks: number | string
  ) => {
    if (
      weeks === "Infinity" ||
      weeks === Infinity
    ) {
      return "∞";
    }

    const numericWeeks =
      Number(weeks);

    if (!Number.isFinite(numericWeeks)) {
      return "—";
    }

    return numericWeeks.toLocaleString(
      "fr-FR",
      {
        maximumFractionDigits: 2,
      }
    );
  };

  return (
    <div className="medicine-analysis-page">


      <main className="medicine-analysis-content">

        {/* HEADER */}

        <div className="medicine-analysis-header">

          <div>

            <h1>
              Analyse du médicament
            </h1>

            {prediction && (
              <p>
                Situation actuelle de{" "}
                <strong>
                  {prediction.medicineName}
                </strong>
              </p>
            )}

          </div>

        </div>


        {/* LOADING */}

        {loading && (

          <div className="analysis-message">
            Analyse du médicament en cours...
          </div>

        )}


        {/* ERROR */}

        {!loading && error && (

          <div className="analysis-error">

            <strong>
              Impossible de charger l'analyse
            </strong>

            <span>
              {error}
            </span>

            <button
              type="button"
              onClick={loadMedicineAnalysis}
            >
              Réessayer
            </button>

          </div>

        )}


        {/* CONTENT */}

        {!loading && prediction && (

          <>

            {/* MEDICINE TITLE */}

            <section className="medicine-card">

              <div className="medicine-card-icon">
                💊
              </div>

              <div className="medicine-card-info">

                <span>
                  Médicament
                </span>

                <h2>
                  {prediction.medicineName}
                </h2>

                <small>
                  ID médicament :{" "}
                  {prediction.medicineId}
                </small>

              </div>

              {(() => {

                const alert =
                  getAlertInfo(
                    prediction.alertType
                  );

                return (
                  <div
                    className={`medicine-status ${alert.className}`}
                  >
                    <span>
                      {alert.icon}
                    </span>

                    {alert.label}
                  </div>
                );

              })()}

            </section>


            {/* CURRENT SITUATION */}

            <section className="analysis-section">

              <div className="section-title">

                <h2>
                  Situation actuelle
                </h2>

                <span>
                  Analyse du stock
                </span>

              </div>


              <div className="metrics-grid">

                <div className="metric-card">

                  <span className="metric-label">
                    Stock actuel
                  </span>

                  <strong>
                    {prediction.currentStock}
                  </strong>

                  <small>
                    unités disponibles
                  </small>

                </div>


                <div className="metric-card">

                  <span className="metric-label">
                    Demande hebdomadaire
                  </span>

                  <strong>
                    {prediction.weeklyDemand}
                  </strong>

                  <small>
                    unités / semaine
                  </small>

                </div>


                <div className="metric-card">

                  <span className="metric-label">
                    Couverture du stock
                  </span>

                  <strong>
                    {formatWeeksOfStock(
                      prediction.weeksOfStock
                    )}
                  </strong>

                  <small>
                    semaines
                  </small>

                </div>


                <div className="metric-card">

                  <span className="metric-label">
                    Réapprovisionnement conseillé
                  </span>

                  <strong>
                    {prediction.recommendedQuantity}
                  </strong>

                  <small>
                    unités
                  </small>

                </div>

              </div>

            </section>


            {/* AI ANALYSIS */}

            <section className="analysis-section">

              <div className="section-title">

                <h2>
                  Analyse intelligente
                </h2>

                <span>
                  Recommandation IA
                </span>

              </div>


              <div className="ai-analysis-card">

                <div className="ai-analysis-icon">
                  ⚡
                </div>

                <div>

                  <h3>
                    Évaluation de la situation
                  </h3>

                  <p>
                    {prediction.alertMessage}
                  </p>

                </div>

              </div>

            </section>


            {/* RECOMMENDATION */}

            <section className="analysis-section">

              <div className="section-title">

                <h2>
                  Recommandation
                </h2>

              </div>


              <div className="recommendation-card">

                {prediction.recommendedQuantity > 0 ? (

                  <>
                    <div className="recommendation-icon">
                      📦
                    </div>

                    <div>

                      <strong>
                        Réapprovisionnement recommandé
                      </strong>

                      <p>
                        Il est recommandé de
                        prévoir{" "}
                        <strong>
                          {prediction.recommendedQuantity}{" "}
                          unités
                        </strong>{" "}
                        pour ce médicament.
                      </p>

                    </div>
                  </>

                ) : (

                  <>
                    <div className="recommendation-icon neutral">
                      ✓
                    </div>

                    <div>

                      <strong>
                        Aucun réapprovisionnement calculé
                      </strong>

                      <p>
                        Les données actuelles ne
                        permettent pas de calculer
                        une quantité de
                        réapprovisionnement fiable.
                      </p>

                    </div>
                  </>

                )}

              </div>

            </section>


            {/* ACTIONS */}

            <div className="analysis-actions">

              <Link
                to="/stock"
                className="secondary-action"
              >
                ← Retour à l'inventaire
              </Link>

              <Link
                to="/dashboard"
                className="primary-action"
              >
                Retour au dashboard
              </Link>

            </div>

          </>

        )}

      </main>

    </div>
  );
}

export default MedicineAnalysis;