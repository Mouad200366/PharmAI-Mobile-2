import { useEffect, useState } from "react";
import StatusBadge from "../../components/StatusBadge";
import SearchBar from "../../components/SearchBar";
import "./Orders.css";
import { ordersApi } from "../../services/api";
import type { Order } from "../../services/api";
import { useNavigate } from "react-router-dom";

function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  // =========================================================
  // GET LOGGED-IN PHARMACY
  // =========================================================

  const storedUser = localStorage.getItem("pharmacyUser");

  const pharmacyUser = storedUser
    ? JSON.parse(storedUser)
    : null;

  const pharmacyId = pharmacyUser?.pharmacyId;

  // =========================================================
  // LOAD ORDERS
  // =========================================================

  useEffect(() => {
    if (!pharmacyId) {
      setError(
        "Informations de la pharmacie introuvables. Veuillez vous reconnecter."
      );
      setLoading(false);
      return;
    }

    fetchOrders();
  }, [pharmacyId]);

  const fetchOrders = async () => {
    if (!pharmacyId) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await ordersApi.getOrders(
        pharmacyId
      );

      setOrders(data);
    } catch (error) {
      console.error("Orders error:", error);

      setError(
        "Impossible de récupérer les commandes."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // FILTER ORDERS
  // =========================================================

  const filteredOrders = orders.filter(
    (order) => {
      const searchValue =
        search.toLowerCase().trim();

      const matchesSearch =
        order.id
          .toString()
          .includes(searchValue) ||
        order.deliveryAddress
          .toLowerCase()
          .includes(searchValue) ||
        order.customerId
          .toString()
          .includes(searchValue) ||
        order.items.some((item) =>
          item.medicineName
            .toLowerCase()
            .includes(searchValue)
        );

      let matchesFilter = true;

      if (activeFilter === "pending") {
        matchesFilter =
          order.status === "pending_review";
      }

      if (activeFilter === "accepted") {
        matchesFilter =
          order.status === "accepted";
      }

      if (activeFilter === "ready") {
        matchesFilter =
          order.status === "ready_for_pickup";
      }

      return (
        matchesSearch &&
        matchesFilter
      );
    }
  );

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="orders-page">


      {/* =====================================================
          CONTENT
      ===================================================== */}

      <main className="orders-content">

        <div className="orders-heading">

          <div>

            <h1>
              Commandes
            </h1>

            <p>
              Gérez les commandes de votre officine
            </p>

          </div>

          <div className="orders-count">
            {orders.length} commande
            {orders.length !== 1 ? "s" : ""}
          </div>

        </div>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {error && (
          <div className="orders-error">
            {error}
          </div>
        )}

        {/* =====================================================
            FILTER BAR
        ===================================================== */}

        <section className="orders-toolbar">

          <SearchBar
            className="orders-search"
            value={search}
            onChange={setSearch}
            placeholder="Rechercher une commande..."
          />

          <div className="order-filters">

            <button
              className={
                activeFilter === "all"
                  ? "filter active"
                  : "filter"
              }
              onClick={() =>
                setActiveFilter("all")
              }
            >
              Toutes
            </button>

            <button
              className={
                activeFilter === "pending"
                  ? "filter active"
                  : "filter"
              }
              onClick={() =>
                setActiveFilter("pending")
              }
            >
              En attente
            </button>

            <button
              className={
                activeFilter === "accepted"
                  ? "filter active"
                  : "filter"
              }
              onClick={() =>
                setActiveFilter("accepted")
              }
            >
              Acceptées
            </button>

            <button
              className={
                activeFilter === "ready"
                  ? "filter active"
                  : "filter"
              }
              onClick={() =>
                setActiveFilter("ready")
              }
            >
              Prêtes
            </button>

          </div>

        </section>

        {/* =====================================================
            ORDERS
        ===================================================== */}

        <section className="orders-list">

          {/* LOADING */}

          {loading && (
            <div className="orders-loading">
              Chargement des commandes...
            </div>
          )}

          {/* EMPTY */}

          {!loading &&
            !error &&
            filteredOrders.length === 0 && (

              <div className="orders-empty">

                <div className="empty-icon">
                  ▱
                </div>

                <h3>
                  Aucune commande trouvée
                </h3>

                <p>
                  Aucune commande ne correspond
                  à votre recherche.
                </p>

              </div>
            )}

          {/* ORDER CARDS */}

          {!loading &&
            filteredOrders.map((order) => (

              <article
                className="order-card"
                key={order.id}
                onClick={() =>
                  navigate(`/orders/${order.id}`)
                }
              >

                {/* =================================================
                    CARD HEADER
                ================================================= */}

                <div className="order-card-header">

                  <div>

                    <span className="order-number">
                      Commande #{order.id}
                    </span>

                    <span className="order-date">
                      {new Date(
                        order.createdAt
                      ).toLocaleString(
                        "fr-FR"
                      )}
                    </span>

                  </div>

                  <StatusBadge
                    status={order.status}
                    className="order-status"
                  />

                </div>

                {/* =================================================
                    CARD BODY
                ================================================= */}

                <div className="order-card-body">

                  {/* CUSTOMER */}

                  <div className="order-information">

                    <span className="information-label">
                      CLIENT
                    </span>

                    <strong>
                      {order.customerName}
                    </strong>

                    <p>
                      {order.deliveryAddress}
                    </p>

                  </div>

                  {/* MEDICINES */}

                  <div className="order-information">

                    <span className="information-label">
                      MÉDICAMENTS
                    </span>

                    <div className="medicine-list">

                      {order.items.map(
                        (item) => (

                          <div
                            className="medicine-item"
                            key={item.id}
                          >

                            <span>
                              {item.medicineName}
                            </span>

                            <strong>
                              ×{item.quantity}
                            </strong>

                          </div>

                        )
                      )}

                    </div>

                  </div>

                  {/* TOTAL */}

                  <div
                    className="order-information total-information"
                  >

                    <span className="information-label">
                      TOTAL
                    </span>

                    <strong className="order-total">
                      {Number(
                        order.grandTotal
                      ).toFixed(2)}{" "}
                      DH
                    </strong>

                    <span>
                      {order.paymentMethod ===
                      "cash"
                        ? "Paiement à la livraison"
                        : order.paymentMethod}
                    </span>

                  </div>

                </div>

                {/* =================================================
                    CARD FOOTER
                ================================================= */}

                <div className="order-card-footer">

                  <span>
                    {order.items.length}{" "}
                    médicament
                    {order.items.length !== 1
                      ? "s"
                      : ""}
                  </span>

                  <div className="order-actions">

                    {/* PRESCRIPTION REVIEW */}

                    {order.status ===
                      "pending_review" && (

                      <button
                        className="primary-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/orders/${order.id}`);
                        }}
                      >
                        Vérifier l'ordonnance
                      </button>

                    )}

                    {/* ACCEPTED / PREPARING */}

                    {(order.status === "accepted" ||
                      order.status === "preparing") && (

                      <button
                        className="primary-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/orders/${order.id}`);
                        }}
                      >
                        {order.status === "preparing"
                          ? "Continuer la préparation"
                          : "Préparer par scan"}
                      </button>

                    )}

                    {/* READY / DELIVERY DISPATCH */}

                    {(order.status === "ready_for_pickup" ||
                      order.status === "awaiting_agent") && (

                      <span className="ready-message">
                        ✓ Prête — recherche d'un livreur
                      </span>

                    )}

                  </div>

                </div>

              </article>

            ))}

        </section>

      </main>

    </div>
  );
}

export default Orders;