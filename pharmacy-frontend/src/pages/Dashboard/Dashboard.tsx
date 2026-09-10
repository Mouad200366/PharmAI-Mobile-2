import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  ordersApi,
  stockApi,
  aiApi,
  deliveryApi,
} from "../../services/api";

import type {
  Order,
  StockItem,
  StockPrediction,
} from "../../services/api";

import AiAssistant from "../../components/AiAssistant";

import SearchBar from "../../components/SearchBar";
import "./Dashboard.css";

const storedUser =
  localStorage.getItem("pharmacyUser");

const pharmacyUser = storedUser
  ? JSON.parse(storedUser)
  : null;

const PHARMACY_ID =
  pharmacyUser?.pharmacyId;

function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [, setStock] = useState<StockItem[]>([]);
  const [stockPredictions, setStockPredictions] =
    useState<StockPrediction[]>([]);

  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDeliveryAgents, setActiveDeliveryAgents] = useState(0);

  /* =========================================================
     LOAD DASHBOARD DATA
  ========================================================= */

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {

  try {

    setLoading(true);
    setError("");

    if (!PHARMACY_ID) {
      throw new Error(
        "Pharmacie introuvable."
      );
    }

    const [
      ordersData,
      stockData,
      stockPredictionsData,
      activeDeliveryAgentsData,
    ] = await Promise.all([

      ordersApi.getOrders(PHARMACY_ID),

      stockApi.getStock(PHARMACY_ID),

      aiApi.getStockPredictions(PHARMACY_ID).catch((error) => {
        console.warn("AI stock predictions unavailable:", error);
        return [];
      }),
      deliveryApi.getActiveAgentsCount().catch((error) => {
    console.warn("Active delivery agents unavailable:", error);
    return 0;
  }),

    ]);

    setOrders(ordersData);
    setStock(stockData);
    setStockPredictions(stockPredictionsData);
    setActiveDeliveryAgents(activeDeliveryAgentsData);

  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );

    setError(
      "Impossible de récupérer les données du dashboard."
    );

  } finally {

    setLoading(false);

  }

};

  /* =========================================================
     HELPERS
  ========================================================= */

  const isToday = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const formatPrice = (value: number) => {
    return Number(value).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatOrderId = (id: number) => {
    return `#CMD-${String(id).padStart(4, "0")}`;
  };

  const getStatusInfo = (status: string) => {
    const normalizedStatus = status.toLowerCase();

    if (
      normalizedStatus.includes("pending") ||
      normalizedStatus.includes("waiting") ||
      normalizedStatus.includes("attente")
    ) {
      return {
        label: "En attente",
        className: "pending",
      };
    }

    if (
      normalizedStatus.includes("prepar") ||
      normalizedStatus.includes("processing")
    ) {
      return {
        label: "En préparation",
        className: "preparing",
      };
    }

    if (
      normalizedStatus.includes("ready") ||
      normalizedStatus.includes("prêt")
    ) {
      return {
        label: "Prêt",
        className: "ready",
      };
    }

    if (
      normalizedStatus.includes("delivered") ||
      normalizedStatus.includes("livr")
    ) {
      return {
        label: "Livrée",
        className: "ready",
      };
    }

    if (
      normalizedStatus.includes("cancel") ||
      normalizedStatus.includes("annul")
    ) {
      return {
        label: "Annulée",
        className: "pending",
      };
    }

    return {
      label: status,
      className: "preparing",
    };
  };

  /* =========================================================
     TODAY'S ORDERS
  ========================================================= */

  const todaysOrders = useMemo(() => {
    return orders.filter((order) =>
      isToday(order.createdAt)
    );
  }, [orders]);

  /* =========================================================
     TODAY'S REVENUE
  ========================================================= */

  const todaysRevenue = useMemo(() => {
    return todaysOrders.reduce(
      (total, order) =>
        total + Number(order.grandTotal || 0),
      0
    );
  }, [todaysOrders]);

  /* =========================================================
     AI STOCK PREDICTIONS
  ========================================================= */

  const criticalPredictions = useMemo(() => {
    return stockPredictions.filter(
      (prediction) =>
        prediction.alertType === "CRITICAL"
    );
  }, [stockPredictions]);

  const aiAlertCount =
    criticalPredictions.length +
    stockPredictions.filter(
      (prediction) =>
        prediction.alertType === "LOW_STOCK"
    ).length;

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return orders;
    }

    return orders.filter((order) => {
      const orderId =
        String(order.id).toLowerCase();

      const formattedOrderId =
        formatOrderId(order.id).toLowerCase();

      const customerName =
        order.customerName?.toLowerCase() || "";

      const status =
        order.status?.toLowerCase() || "";

      const address =
        order.deliveryAddress?.toLowerCase() || "";

      const medicines = order.items
        .map(
          (item) =>
            item.medicineName?.toLowerCase() || ""
        )
        .join(" ");

      return (
        orderId.includes(search) ||
        formattedOrderId.includes(search) ||
        customerName.includes(search) ||
        status.includes(search) ||
        address.includes(search) ||
        medicines.includes(search)
      );
    });
  }, [orders, searchTerm]);

  /* =========================================================
     RECENT ORDERS
  ========================================================= */

  const recentOrders = useMemo(() => {
    return [...filteredOrders]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      )
      .slice(0, 5);
  }, [filteredOrders]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="dashboard-page">

      {/* =====================================================
          NAVBAR
      ===================================================== */}


      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <main className="dashboard-content">

        {/* ===================================================
            HEADING
        =================================================== */}

        <div className="dashboard-heading">

          <div>

            <h1>
              Dashboard
            </h1>

            <p>
  Bienvenue,{" "}
  <strong>
    {pharmacyUser?.firstName}
  </strong>
</p>

          </div>

          {/* SEARCH */}

          <SearchBar
            className="dashboard-search"
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher patient, médicament, commande..."
          />

        </div>

        {/* ===================================================
            SEARCH RESULT INFO
        =================================================== */}

        {searchTerm && !loading && (
          <div className="search-result-info">
            {filteredOrders.length === 0
              ? "Aucun résultat trouvé."
              : `${filteredOrders.length} commande${
                  filteredOrders.length > 1
                    ? "s"
                    : ""
                } trouvée${
                  filteredOrders.length > 1
                    ? "s"
                    : ""
                }.`}
          </div>
        )}

        {/* ===================================================
            ERROR
        =================================================== */}

        {error && (

          <div
            style={{
              marginBottom: "20px",
              padding: "14px 18px",
              background: "#fff0f0",
              border: "1px solid #ffd5d5",
              borderRadius: "8px",
              color: "#c52f2f",
              fontSize: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "15px",
            }}
          >

            <span>
              {error}
            </span>

            <button
              onClick={fetchDashboardData}
              style={{
                border: "none",
                background: "#c52f2f",
                color: "white",
                padding: "7px 12px",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Réessayer
            </button>

          </div>

        )}

        {/* ===================================================
            STAT CARDS
        =================================================== */}

        <section className="stats-grid">

          {/* ORDERS */}

          <div className="stat-card">

            <div className="stat-card-top">

              <div className="stat-icon blue">
                ▣
              </div>

            </div>

            <span className="stat-label">
              Commandes aujourd'hui
            </span>

            <strong className="stat-value">
              {loading
                ? "—"
                : todaysOrders.length}
            </strong>

          </div>

          {/* REVENUE */}

          <div className="stat-card">

            <div className="stat-card-top">

              <div className="stat-icon blue">
                ▣
              </div>

            </div>

            <span className="stat-label">
              Chiffre d'affaires
            </span>

            <strong className="stat-value">

              {loading
                ? "—"
                : formatPrice(todaysRevenue)}

              {!loading && (
                <small>
                  {" "}DH
                </small>
              )}

            </strong>

          </div>

          {/* AI STOCK ALERTS */}

          <div className="stat-card warning-card">

            <div className="stat-card-top">

              <div className="stat-icon red">
                ⚠
              </div>

            </div>

            <span className="stat-label">
              Alertes stock
            </span>

            <strong className="stat-value danger">
              {loading
                ? "—"
                : aiAlertCount}
            </strong>

          </div>

          {/* DELIVERY */}

          <div className="stat-card">

            <div className="stat-card-top">

              <div className="stat-icon blue">
                ▣
              </div>

            </div>

            <span className="stat-label">
              Livreurs actifs
            </span>

             <strong className="stat-value">
               {loading ? "—" : activeDeliveryAgents}
              </strong>

          </div>

        </section>

        {/* ===================================================
            LOWER DASHBOARD
        =================================================== */}

        <section className="dashboard-panels">

          {/* =================================================
              RECENT ORDERS
          ================================================= */}

          <div className="orders-panel">

            <div className="panel-header">

              <h2>
                {searchTerm
                  ? "Résultats de recherche"
                  : "Commandes récentes"}
              </h2>

              <Link to="/orders">
                Voir tout →
              </Link>

            </div>

            <div className="orders-table">

              <div className="table-header">

                <span>ID</span>

                <span>
                  Patient
                </span>

                <span>
                  Médicaments
                </span>

                <span>
                  Statut
                </span>

              </div>

              {/* LOADING */}

              {loading ? (

                <div
                  style={{
                    minHeight: "180px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8993a4",
                    fontSize: "11px",
                  }}
                >
                  Chargement des commandes...
                </div>

              ) : recentOrders.length === 0 ? (

                /* NO RESULTS */

                <div
                  style={{
                    minHeight: "180px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8993a4",
                    fontSize: "11px",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  {searchTerm
                    ? "Aucune commande ne correspond à votre recherche."
                    : "Aucune commande récente."}
                </div>

              ) : (

                /* ORDERS */

                recentOrders.map((order) => {

                  const status =
                    getStatusInfo(order.status);

                  const medicineText =
                    order.items.length === 0
                      ? "Aucun médicament"
                      : order.items
                          .map(
                            (item) =>
                              `${item.medicineName} ×${item.quantity}`
                          )
                          .join(", ");

                  return (

                    <div
                      className="table-row"
                      key={order.id}
                    >

                      <span className="order-id">
                        {formatOrderId(order.id)}
                      </span>

                      <span className="patient-name">
                        {order.customerName}
                      </span>

                      <span className="medicine-name">
                        {medicineText}
                      </span>

                      <span>

                        <span
                          className={`status-badge ${status.className}`}
                        >
                          <i></i>
                          {status.label}
                        </span>

                      </span>

                    </div>

                  );
                })

              )}

            </div>

          </div>

          {/* =================================================
              AI ASSISTANT
          ================================================= */}

          <div className="ai-assistant-dashboard">
            <AiAssistant
              pharmacyId={PHARMACY_ID}
            />
          </div>

          {/* =================================================
              AI STOCK INTELLIGENCE
          ================================================= */}

          <div className="alerts-panel ai-stock-panel">

            <div className="panel-header alerts-header">

              <h2>
                <span>⚡</span>
                Alertes intelligentes
              </h2>

            </div>

            <div className="alerts-list">

              {loading ? (

                <div
                  style={{
                    minHeight: "180px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8993a4",
                    fontSize: "11px",
                  }}
                >
                  Analyse intelligente du stock...
                </div>

              ) : stockPredictions.length === 0 ? (

                <div
                  style={{
                    minHeight: "180px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8993a4",
                    fontSize: "11px",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  Aucune anomalie de stock détectée.
                </div>

              ) : (

                stockPredictions
                  .filter(
                    (prediction) =>
                      prediction.alertType !== "SLOW_MOVING"
                  )
                  .slice(0, 4)
                  .map((prediction) => {

                    const isCritical =
                      prediction.alertType === "CRITICAL";

                    const isLowStock =
                      prediction.alertType === "LOW_STOCK";

                    const isHighDemand =
                      prediction.alertType === "HIGH_DEMAND";

                    const isOverstock =
                      prediction.alertType === "OVERSTOCK";

                    let alertClass = "low";
                    let icon = "▥";

                    if (isCritical) {
                      alertClass = "rupture";
                      icon = "⚠";
                    } else if (isHighDemand) {
                      alertClass = "high-demand";
                      icon = "📈";
                    } else if (isOverstock) {
                      alertClass = "overstock";
                      icon = "📦";
                    } else if (isLowStock) {
                      alertClass = "low";
                      icon = "⏳";
                    }

                    return (

                      <div
                        className="stock-alert"
                        key={prediction.medicineId}
                      >

                        <div
                          className={`stock-alert-icon ${alertClass}`}
                        >
                          {icon}
                        </div>

                        <div className="stock-alert-content">

                          <strong>
                            {prediction.medicineName}
                          </strong>

                          <span>
                            {prediction.alertMessage}
                          </span>

                          {prediction.recommendedQuantity > 0 && (
                            <small>
                              Recommandation :{" "}
                              <strong>
                                {prediction.recommendedQuantity} unités
                              </strong>
                            </small>
                          )}

                        </div>

                        <Link
                          className={`stock-action ${alertClass}`}
                          to={`/stock-analysis/${prediction.medicineId}`}
                          style={{
                           textDecoration: "none",
                           }}
                          >
                             Voir
                        </Link>

                      </div>

                    );

                  })

              )}

            </div>

            <Link
              className="inventory-link"
              to="/stock"
            >
              Consulter l'analyse complète du stock
            </Link>

          </div>

        </section>

        {/* ===================================================
            REFRESH
        =================================================== */}

        <div
          style={{
            marginTop: "18px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            style={{
              border: "1px solid #dbe3f0",
              background: "white",
              color: "#123f91",
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "10px",
              fontWeight: 600,
              cursor: loading
                ? "default"
                : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            ↻ Actualiser le dashboard
          </button>

        </div>

      </main>

    </div>
  );
}

export default Dashboard;