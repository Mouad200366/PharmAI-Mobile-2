import { useEffect, useState } from "react";
import { stockApi } from "../../services/api";
import type { StockItem } from "../../services/api";
import SearchBar from "../../components/SearchBar";
import "./Stock.css";

const storedUser = localStorage.getItem("pharmacyUser");

const pharmacyUser = storedUser
  ? JSON.parse(storedUser)
  : null;

const pharmacyId = pharmacyUser?.pharmacyId;

function Stock() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingStock, setEditingStock] =
    useState<StockItem | null>(null);

  const [editQuantity, setEditQuantity] =
    useState("");

  const [editPrice, setEditPrice] =
    useState("");

  const [editAvailable, setEditAvailable] =
    useState(true);

  const [saving, setSaving] = useState(false);


  /* =========================
     LOAD STOCK
  ========================= */

  useEffect(() => {
    fetchStock();
  }, []);

  const fetchStock = async () => {
  try {
    setLoading(true);
    setError("");

    if (!pharmacyId) {
      setError("Session utilisateur introuvable.");
      return;
    }

    const data =
      await stockApi.getStock(pharmacyId);

    setStock(data);

  } catch (error) {
    console.error("Stock error:", error);

    setError(
      "Impossible de récupérer le stock."
    );

  } finally {
    setLoading(false);
  }
};


  /* =========================
     EDIT
  ========================= */

  const openEdit = (item: StockItem) => {
    setEditingStock(item);

    setEditQuantity(
      item.quantity.toString()
    );

    setEditPrice(
      Number(item.price).toFixed(2)
    );

    setEditAvailable(item.available);
  };


  const closeEdit = () => {
    if (saving) return;

    setEditingStock(null);
  };


  /* =========================
     SAVE
  ========================= */

  const saveStock = async () => {
    if (!editingStock) return;

    const quantity = Number(editQuantity);
    const price = Number(editPrice);

    if (
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      alert("La quantité doit être un entier positif.");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      alert("Le prix doit être positif.");
      return;
    }

    try {
      setSaving(true);

      if (!pharmacyId) {
  alert("Session utilisateur introuvable.");
  return;
}

const updated =
  await stockApi.updateStock(
    pharmacyId,
    editingStock.id,
          {
            quantity,
            price,
            available: editAvailable,
          }
        );

      setStock((currentStock) =>
        currentStock.map((item) =>
          item.id === updated.id
            ? updated
            : item
        )
      );

      setEditingStock(null);

    } catch (error) {
      console.error(
        "Stock update error:",
        error
      );

      alert(
        "Impossible de modifier le stock."
      );

    } finally {
      setSaving(false);
    }
  };


  /* =========================
     STATUS
  ========================= */

  const getStockStatus = (
    item: StockItem
  ) => {
    if (!item.available || item.quantity === 0) {
      return {
        label: "Rupture",
        className: "out-of-stock",
      };
    }

    if (item.quantity <= 5) {
      return {
        label: "Stock faible",
        className: "low-stock",
      };
    }

    return {
      label: "Disponible",
      className: "available-stock",
    };
  };


  /* =========================
     FILTER
  ========================= */

  const filteredStock = stock.filter(
    (item) => {

      const searchValue =
        search.toLowerCase();

      const matchesSearch =
        item.medicineName
          .toLowerCase()
          .includes(searchValue);

      let matchesFilter = true;

      if (filter === "available") {
        matchesFilter =
          item.available &&
          item.quantity > 5;
      }

      if (filter === "low") {
        matchesFilter =
          item.available &&
          item.quantity > 0 &&
          item.quantity <= 5;
      }

      if (filter === "out") {
        matchesFilter =
          !item.available ||
          item.quantity === 0;
      }

      if (filter === "prescription") {
        matchesFilter =
          item.requiresPrescription;
      }

      return (
        matchesSearch &&
        matchesFilter
      );
    }
  );


  /* =========================
     STATISTICS
  ========================= */

  const totalProducts =
    stock.length;

  const availableProducts =
    stock.filter(
      (item) =>
        item.available &&
        item.quantity > 5
    ).length;

  const lowStockProducts =
    stock.filter(
      (item) =>
        item.available &&
        item.quantity > 0 &&
        item.quantity <= 5
    ).length;

  const outOfStockProducts =
    stock.filter(
      (item) =>
        !item.available ||
        item.quantity === 0
    ).length;


  /* =========================
     RENDER
  ========================= */

  return (
    <div className="stock-page">



      <main className="stock-content">

        {/* HEADER */}

        <div className="stock-heading">

          <div>
            <span className="stock-eyebrow">
              PHARMACIE
            </span>

            <h1>
              Gestion du stock
            </h1>

            <p>
              Gérez les médicaments et
              leurs disponibilités en temps réel.
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={fetchStock}
          >
            ↻ Actualiser
          </button>

        </div>


        {/* STATISTICS */}

        <section className="stock-stats">

          <div className="stock-stat-card">

            <span className="stat-icon blue">
              ◫
            </span>

            <div>
              <span>
                Total produits
              </span>

              <strong>
                {totalProducts}
              </strong>
            </div>

          </div>


          <div className="stock-stat-card">

            <span className="stat-icon green">
              ✓
            </span>

            <div>
              <span>
                Disponibles
              </span>

              <strong>
                {availableProducts}
              </strong>
            </div>

          </div>


          <div className="stock-stat-card">

            <span className="stat-icon orange">
              !
            </span>

            <div>
              <span>
                Stock faible
              </span>

              <strong>
                {lowStockProducts}
              </strong>
            </div>

          </div>


          <div className="stock-stat-card">

            <span className="stat-icon red">
              ×
            </span>

            <div>
              <span>
                Rupture
              </span>

              <strong>
                {outOfStockProducts}
              </strong>
            </div>

          </div>

        </section>


        {/* TOOLBAR */}

        <section className="stock-toolbar">

          <SearchBar
            className="stock-search"
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un médicament..."
          />


          <div className="stock-filters">

            <button
              className={
                filter === "all"
                  ? "stock-filter active"
                  : "stock-filter"
              }
              onClick={() =>
                setFilter("all")
              }
            >
              Tous
            </button>

            <button
              className={
                filter === "available"
                  ? "stock-filter active"
                  : "stock-filter"
              }
              onClick={() =>
                setFilter("available")
              }
            >
              Disponibles
            </button>

            <button
              className={
                filter === "low"
                  ? "stock-filter active"
                  : "stock-filter"
              }
              onClick={() =>
                setFilter("low")
              }
            >
              Stock faible
            </button>

            <button
              className={
                filter === "out"
                  ? "stock-filter active"
                  : "stock-filter"
              }
              onClick={() =>
                setFilter("out")
              }
            >
              Rupture
            </button>

            <button
              className={
                filter === "prescription"
                  ? "stock-filter active"
                  : "stock-filter"
              }
              onClick={() =>
                setFilter("prescription")
              }
            >
              Ordonnance
            </button>

          </div>

        </section>


        {/* STOCK TABLE */}

        <section className="stock-card">

          <div className="stock-table-header">

            <div>
              Médicament
            </div>

            <div>
              Prix
            </div>

            <div>
              Quantité
            </div>

            <div>
              Statut
            </div>

            <div>
              Ordonnance
            </div>

            <div>
              Action
            </div>

          </div>


          {loading && (

            <div className="stock-message">
              Chargement du stock...
            </div>

          )}


          {!loading && error && (

            <div className="stock-message error">
              <strong>
                Une erreur est survenue
              </strong>

              <p>
                {error}
              </p>

              <button
                onClick={fetchStock}
              >
                Réessayer
              </button>
            </div>

          )}


          {!loading &&
            !error &&
            filteredStock.length === 0 && (

              <div className="stock-message">

                <div className="empty-stock-icon">
                  ◫
                </div>

                <strong>
                  Aucun médicament trouvé
                </strong>

                <p>
                  Aucun produit ne correspond
                  à votre recherche.
                </p>

              </div>

            )}


          {!loading &&
            !error &&
            filteredStock.map((item) => {

              const status =
                getStockStatus(item);

              return (

                <div
                  className="stock-row"
                  key={item.id}
                >

                  <div className="medicine-cell">

                    <div className="medicine-stock-icon">
                      +
                    </div>

                    <div>

                      <strong>
                        {item.medicineName}
                      </strong>

                      {item.requiresPrescription && (

                        <span className="prescription-tag">
                          Ordonnance
                        </span>

                      )}

                    </div>

                  </div>


                  <div className="stock-price">
                    {Number(item.price).toFixed(2)}
                    {" "}DH
                  </div>


                  <div className="stock-quantity">

                    <strong>
                      {item.quantity}
                    </strong>

                    <span>
                      unités
                    </span>

                  </div>


                  <div>

                    <span
                      className={`stock-status ${status.className}`}
                    >
                      <span className="status-dot">
                        ●
                      </span>

                      {status.label}
                    </span>

                  </div>


                  <div>

                    {item.requiresPrescription ? (

                      <span className="prescription-required">
                        Oui
                      </span>

                    ) : (

                      <span className="prescription-not-required">
                        Non
                      </span>

                    )}

                  </div>


                  <div>

                    <button
                      className="edit-stock-button"
                      onClick={() =>
                        openEdit(item)
                      }
                    >
                      Modifier
                    </button>

                  </div>

                </div>

              );
            })}

        </section>

      </main>


      {/* EDIT MODAL */}

      {editingStock && (

        <div
          className="stock-modal-overlay"
          onMouseDown={(e) => {

            if (
              e.target === e.currentTarget
            ) {
              closeEdit();
            }

          }}
        >

          <div className="stock-modal">

            <div className="modal-header">

              <div>

                <span className="stock-eyebrow">
                  MODIFICATION
                </span>

                <h2>
                  {editingStock.medicineName}
                </h2>

              </div>

              <button
                className="modal-close"
                onClick={closeEdit}
              >
                ×
              </button>

            </div>


            <div className="modal-form">

              <div className="modal-field">

                <label>
                  Quantité
                </label>

                <input
                  type="number"
                  min="0"
                  value={editQuantity}
                  onChange={(e) =>
                    setEditQuantity(
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="modal-field">

                <label>
                  Prix (DH)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) =>
                    setEditPrice(
                      e.target.value
                    )
                  }
                />

              </div>


              <label className="availability-toggle">

                <input
                  type="checkbox"
                  checked={editAvailable}
                  onChange={(e) =>
                    setEditAvailable(
                      e.target.checked
                    )
                  }
                />

                <span>
                  Produit disponible à la vente
                </span>

              </label>

            </div>


            <div className="modal-actions">

              <button
                className="cancel-button"
                onClick={closeEdit}
                disabled={saving}
              >
                Annuler
              </button>

              <button
                className="save-button"
                onClick={saveStock}
                disabled={saving}
              >
                {saving
                  ? "Enregistrement..."
                  : "Enregistrer"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default Stock;