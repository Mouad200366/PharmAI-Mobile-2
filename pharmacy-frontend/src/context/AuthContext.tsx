
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { authApi } from "../services/api";
import type { LoginResponse } from "../services/api";

// ======================================================
// AUTH CONTEXT TYPE
// ======================================================

interface AuthContextType {
  user: LoginResponse | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginResponse) => void;
  logout: () => Promise<void>;
}

// ======================================================
// AUTH CONTEXT
// ======================================================

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// ======================================================
// AUTH PROVIDER
// ======================================================

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<LoginResponse | null>(
    null
  );

  const [loading, setLoading] = useState(true);

  // ====================================================
  // VERIFY SESSION
  // ====================================================

  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await authApi.getCurrentUser();

        // Backend session is valid
        setUser(response);

        // Keep localStorage synchronized
        localStorage.setItem(
          "pharmacyUser",
          JSON.stringify(response)
        );

      } catch (error) {
        console.warn(
          "Aucune session utilisateur active."
        );

        // No valid backend session
        setUser(null);

        localStorage.removeItem(
          "pharmacyUser"
        );

      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  // ====================================================
  // LOGIN
  // ====================================================

  const login = (data: LoginResponse) => {
    setUser(data);

    localStorage.setItem(
      "pharmacyUser",
      JSON.stringify(data)
    );
  };

  // ====================================================
  // LOGOUT
  // ====================================================

  const logout = async () => {
    try {
      await authApi.logout();

    } catch (error) {
      console.error(
        "Erreur lors de la déconnexion:",
        error
      );

    } finally {
      // Always clear frontend authentication state
      setUser(null);

      localStorage.removeItem(
        "pharmacyUser"
      );
    }
  };

  // ====================================================
  // CONTEXT VALUE
  // ====================================================

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ======================================================
// USE AUTH HOOK
// ======================================================

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth doit être utilisé à l'intérieur de AuthProvider"
    );
  }

  return context;
}

