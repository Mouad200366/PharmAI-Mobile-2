import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Navbar.css";
import pharmaLogo from "../assets/pharmai-logo.jpeg";

function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // ======================================================
  // CLOSE MENU WHEN CLICKING OUTSIDE
  // ======================================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  // ======================================================
  // USER DATA
  // ======================================================

  const userInitial =
    user?.firstName?.charAt(0).toUpperCase() || "?";

  const fullName = user
    ? `${user.firstName} ${user.lastName}`
    : "Utilisateur";

  // ======================================================
  // LOGOUT
  // ======================================================

  const handleLogout = async () => {
    setMenuOpen(false);

    await logout();

    navigate("/", { replace: true });
  };

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <header className="pharma-navbar">

{/* BRAND */}
<div className="pharma-brand">
  <div className="pharma-brand-icon">
    <img
      src={pharmaLogo}
      alt="PharmAI"
      className="pharma-brand-logo"
    />
  </div>

  <div className="pharma-brand-text">
    <span>Espace Pharmacien</span>
  </div>
</div>

      {/* NAVIGATION */}
      <nav className="pharma-navigation">

        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive
              ? "pharma-nav-link active"
              : "pharma-nav-link"
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/orders"
          className={({ isActive }) =>
            isActive
              ? "pharma-nav-link active"
              : "pharma-nav-link"
          }
        >
          Commandes
        </NavLink>

        <NavLink
          to="/stock"
          className={({ isActive }) =>
            isActive
              ? "pharma-nav-link active"
              : "pharma-nav-link"
          }
        >
          Stock
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            isActive
              ? "pharma-nav-link active"
              : "pharma-nav-link"
          }
        >
          Profil
        </NavLink>

      </nav>

      {/* USER MENU */}
      <div
        className="pharma-user"
        ref={userMenuRef}
      >

        <button
          type="button"
          className="user-avatar"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu utilisateur"
          aria-expanded={menuOpen}
        >
          {userInitial}
        </button>

        {menuOpen && (
          <div className="user-menu">

            {/* USER INFORMATION */}
            <div className="user-menu-header">

              <div className="user-menu-avatar">
                {userInitial}
              </div>

              <div className="user-menu-info">
                <strong>{fullName}</strong>

                <span>
                  {user?.email || ""}
                </span>
              </div>

            </div>

            <div className="user-menu-divider" />

            {/* PROFILE */}
            <button
              type="button"
              className="user-menu-item"
              onClick={() => {
                setMenuOpen(false);
                navigate("/profile");
              }}
            >
              <span className="user-menu-icon">
                👤
              </span>

              <span>
                Profil
              </span>
            </button>

            {/* LOGOUT */}
            <button
              type="button"
              className="user-menu-item logout"
              onClick={handleLogout}
            >
              <span className="user-menu-icon">
                ↪
              </span>

              <span>
                Déconnexion
              </span>
            </button>

          </div>
        )}

      </div>

    </header>
  );
}

export default Navbar;