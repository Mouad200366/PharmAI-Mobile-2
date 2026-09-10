import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login/Login";
import Register from "./pages/Register/Register";
import Dashboard from "./pages/Dashboard/Dashboard";
import Orders from "./pages/Orders/Orders";
import OrderDetails from "./pages/Orders/OrderDetails";
import Stock from "./pages/Stock/Stock";
import Profile from "./pages/Profile/Profile";
import MedicineAnalysis from "./pages/Stock/MedicineAnalysis";
import PharmacistLayout from "./layouts/PharmacistLayout";

import {
  AuthProvider,
  useAuth,
} from "./context/AuthContext";

// ======================================================
// LOADING SCREEN
// ======================================================

function AuthLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "18px",
      }}
    >
      Vérification de la session...
    </div>
  );
}

// ======================================================
// PROTECTED ROUTE
// ======================================================

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, loading } = useAuth();

  // ====================================================
  // WAITING FOR AUTH CHECK
  // ====================================================

  if (loading) {
    return <AuthLoading />;
  }

  // ====================================================
  // NOT AUTHENTICATED
  // ====================================================

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // ====================================================
  // AUTHENTICATED
  // ====================================================

  return <>{children}</>;
}

// ======================================================
// ROOT ROUTE
// ======================================================

function RootRoute() {
  const { isAuthenticated, loading } = useAuth();

  // ====================================================
  // WAITING FOR AUTH CHECK
  // ====================================================

  if (loading) {
    return <AuthLoading />;
  }

  // ====================================================
  // ALREADY AUTHENTICATED
  // ====================================================

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // ====================================================
  // NOT AUTHENTICATED
  // ====================================================

  return <Login />;
}

// ======================================================
// APP ROUTES
// ======================================================

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <PharmacistLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetails />} />
        <Route path="/stock" element={<Stock />} />
        <Route
          path="/stock-analysis/:medicineId"
          element={<MedicineAnalysis />}
        />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ======================================================
// APP
// ======================================================

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;