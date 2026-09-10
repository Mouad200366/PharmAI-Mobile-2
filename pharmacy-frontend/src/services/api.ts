const DJANGO_API_BASE_URL =
  import.meta.env.VITE_DJANGO_API_URL || "http://localhost:8000/api/v1";

const SPRING_API_BASE_URL =
  import.meta.env.VITE_SPRING_API_URL || "http://localhost:8082";

const ACCESS_TOKEN_KEY = "pharmacyAccessToken";
const REFRESH_TOKEN_KEY = "pharmacyRefreshToken";

function clearAuthStorage() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem("pharmacyUser");
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return null;

  const response = await fetch(`${DJANGO_API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    clearAuthStorage();
    return null;
  }

  const data = await response.json();
  if (!data?.access) return null;

  localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
  return data.access as string;
}

async function djangoFetch(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  const access = localStorage.getItem(ACCESS_TOKEN_KEY);
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (access) {
    headers.set("Authorization", `Bearer ${access}`);
  }

  const response = await fetch(`${DJANGO_API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry && !path.includes("/auth/pharmacist-login/")) {
    const hadCredentials = Boolean(
      access || localStorage.getItem(REFRESH_TOKEN_KEY),
    );

    if (!hadCredentials) {
      return response;
    }

    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return djangoFetch(path, options, false);
    }

    clearAuthStorage();
    window.location.href = "/";
  }

  return response;
}

async function springFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${SPRING_API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  return response;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null);
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.non_field_errors)) return data.non_field_errors.join(" ");
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

// ======================================================
// TYPES
// ======================================================

export interface OrderItem {
  id: number;
  medicineId: number;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  scannedQuantity?: number;
}

export interface ScanItemProgress {
  orderItemId: number;
  medicineId: number;
  medicineName: string;
  quantity: number;
  scannedQuantity: number;
  complete: boolean;
}

export interface ScanProgress {
  scanned: number;
  required: number;
  percentage: number;
}

export interface ScanMedicineResponse {
  success: boolean;
  message: string;
  orderId: number;
  orderStatus: string;
  scannedMedicineId: number;
  scannedMedicineName: string;
  barcode: string;
  progress: ScanProgress;
  items: ScanItemProgress[];
}

export interface Order {
  id: number;
  createdAt: string;
  deliveryAddress: string;
  itemsTotal: number;
  deliveryFee: number;
  grandTotal: number;
  status: string;
  prescriptionMode: string;
  paymentMethod: string;
  notes: string;
  customerId: number;
  customerName: string;
  pharmacyId: number;
  deliveryAgentId?: number | null;
  deliveryAgentName?: string | null;
  items: OrderItem[];
}

export interface StockItem {
  id: number;
  medicineName: string;
  quantity: number;
  price: number;
  available: boolean;
  requiresPrescription: boolean;
}

export interface StockUpdateRequest {
  quantity?: number;
  price?: number;
  available?: boolean;
}

export interface Pharmacy {
  id: number;
  name: string;
  licenseNumber: string;
  phone: string;
  address: string;
  active: boolean;
  verified: boolean;
}

export interface PharmacyUpdateRequest {
  name: string;
  licenseNumber: string;
  phone: string;
  address: string;
}

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
}

export interface UserUpdateRequest {
  firstName: string;
  lastName: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  userId: number;
  pharmacyId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cin: string;
  dateOfBirth: string;
  gender: "M" | "F";
  pharmacyName: string;
  licenseNumber: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  password: string;
}

export interface StockPrediction {
  medicineId: number;
  medicineName: string;
  currentStock: number;
  weeklyDemand: number;
  weeksOfStock: number;
  alertType:
    | "CRITICAL"
    | "LOW_STOCK"
    | "HIGH_DEMAND"
    | "SLOW_MOVING"
    | "OVERSTOCK";
  alertMessage: string;
  recommendedQuantity: number;
}

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

// ======================================================
// ADAPTERS: Django snake_case -> pharmacist UI camelCase
// ======================================================

function mapOrderItem(item: any): OrderItem {
  return {
    id: item.id,
    medicineId: item.medicine,
    medicineName: item.medicine_name,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    scannedQuantity: item.scanned_quantity ?? 0,
  };
}

function mapOrder(order: any): Order {
  const stored = localStorage.getItem("pharmacyUser");
  const pharmacyId = stored ? JSON.parse(stored)?.pharmacyId ?? 0 : 0;

  return {
    id: order.id,
    createdAt: order.created_at,
    deliveryAddress: order.delivery_address,
    itemsTotal: Number(order.items_total),
    deliveryFee: Number(order.delivery_fee),
    grandTotal: Number(order.grand_total),
    status: order.status,
    prescriptionMode: order.prescription_mode,
    paymentMethod: order.payment_method,
    notes: order.notes || "",
    customerId: order.customer,
    customerName: order.customer_name,
    pharmacyId,
    deliveryAgentId: order.delivery_agent ?? null,
    deliveryAgentName: order.delivery_agent_name ?? null,
    items: (order.items || []).map(mapOrderItem),
  };
}

function mapStock(item: any): StockItem {
  return {
    id: item.id,
    medicineName: item.medicine_name,
    quantity: item.quantity,
    price: Number(item.price),
    available: item.is_available,
    requiresPrescription: item.requires_prescription,
  };
}

function mapPharmacy(item: any): Pharmacy {
  return {
    id: item.id,
    name: item.name,
    licenseNumber: item.license_number,
    phone: item.phone,
    address: item.address,
    active: item.is_active,
    verified: item.is_verified,
  };
}

function mapUser(item: any): User {
  return {
    id: item.id,
    firstName: item.first_name,
    lastName: item.last_name,
    email: item.email,
    fullName: item.full_name,
  };
}

// ======================================================
// SHARED DJANGO DOMAIN API
// ======================================================

export const ordersApi = {
  async getOrders(_pharmacyId: number): Promise<Order[]> {
    const response = await djangoFetch("/orders/");
    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors du chargement des commandes: ${response.status}`));
    }
    const data = await response.json();
const items = Array.isArray(data) ? data : data.results ?? [];
return items.map(mapOrder);
  },

  async getOrder(_pharmacyId: number, orderId: number): Promise<Order> {
    const response = await djangoFetch(`/orders/${orderId}/`);
    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors du chargement de la commande: ${response.status}`));
    }
    return mapOrder(await response.json());
  },

  async updateOrderStatus(
    _pharmacyId: number,
    orderId: number,
    status: string,
  ): Promise<Order> {
    const response = await djangoFetch(`/orders/${orderId}/pharmacy_advance/`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors de la modification du statut: ${response.status}`));
    }
    return mapOrder(await response.json());
  },

  async verifyPrescription(
    _pharmacyId: number,
    orderId: number,
    approve: boolean,
    rejectionReason = "",
  ): Promise<Order> {
    const response = await djangoFetch(`/orders/${orderId}/verify_prescription/`, {
      method: "POST",
      body: JSON.stringify({
        approve,
        rejection_reason: rejectionReason,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors de la vérification de l'ordonnance: ${response.status}`));
    }
    return mapOrder(await response.json());
  },

  async scanMedicine(
    _pharmacyId: number,
    orderId: number,
    barcode: string,
  ): Promise<ScanMedicineResponse> {
    const response = await djangoFetch(`/orders/${orderId}/pharmacy/scan/`, {
      method: "POST",
      body: JSON.stringify({ barcode }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const firstFieldError = data && typeof data === "object"
        ? Object.values(data).flat().find((value) => typeof value === "string")
        : null;
      throw new Error(
        (firstFieldError as string | undefined) ||
        data?.detail ||
        data?.message ||
        `Erreur lors du scan du médicament: ${response.status}`,
      );
    }

    return data as ScanMedicineResponse;
  },
};

export const stockApi = {
  async getStock(_pharmacyId: number): Promise<StockItem[]> {
    const response = await djangoFetch("/stock/");
    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors du chargement du stock: ${response.status}`));
    }
    const data = await response.json();
const items = Array.isArray(data) ? data : data.results ?? [];
return items.map(mapStock);
  },

  async updateStock(
    _pharmacyId: number,
    stockId: number,
    data: StockUpdateRequest,
  ): Promise<StockItem> {
    const response = await djangoFetch(`/stock/${stockId}/`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.available !== undefined ? { is_available: data.available } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors de la modification du stock: ${response.status}`));
    }
    return mapStock(await response.json());
  },
};

export const pharmacyApi = {
  async getPharmacy(_pharmacyId: number): Promise<Pharmacy> {
    const response = await djangoFetch("/pharmacies/me/");
    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors du chargement de la pharmacie: ${response.status}`));
    }
    return mapPharmacy(await response.json());
  },

  async updatePharmacy(
    _pharmacyId: number,
    data: PharmacyUpdateRequest,
  ): Promise<Pharmacy> {
    const response = await djangoFetch("/pharmacies/me/", {
      method: "PATCH",
      body: JSON.stringify({
        name: data.name,
        license_number: data.licenseNumber,
        phone: data.phone,
        address: data.address,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors de la modification de la pharmacie: ${response.status}`));
    }
    return mapPharmacy(await response.json());
  },
};

export const userApi = {
  async getUser(_userId: number): Promise<User> {
    const response = await djangoFetch("/users/me/");
    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors du chargement de l'utilisateur: ${response.status}`));
    }
    return mapUser(await response.json());
  },

  async updateUser(_userId: number, data: UserUpdateRequest): Promise<User> {
    const response = await djangoFetch("/users/me/", {
      method: "PATCH",
      body: JSON.stringify({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, `Erreur lors de la modification de l'utilisateur: ${response.status}`));
    }
    return mapUser(await response.json());
  },
};

// ======================================================
// SPRING-ONLY PHARMACIST AI / ANALYTICS
// ======================================================

export const aiApi = {
  async askPharmacy(pharmacyId: number, question: string): Promise<string> {
    const response = await springFetch(`/api/ai/pharmacy/${pharmacyId}/ask`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    if (!response.ok) {
      throw new Error(`Erreur de l'assistant IA: ${response.status}`);
    }
    return response.text();
  },

  async analyzeStock(pharmacyId: number): Promise<string> {
    const response = await springFetch(`/api/ai/stock-analysis/${pharmacyId}`);
    if (!response.ok) {
      throw new Error(`Erreur lors de l'analyse du stock: ${response.status}`);
    }
    return response.text();
  },

  async getStockPredictions(pharmacyId: number): Promise<StockPrediction[]> {
    const response = await springFetch(`/api/ai/pharmacy/${pharmacyId}/stock-predictions`);
    if (!response.ok) {
      throw new Error(`Erreur lors de l'analyse intelligente du stock: ${response.status}`);
    }
    return response.json();
  },
};

// ======================================================
// DJANGO AUTHORITY FOR PHARMACIST LOGIN
// ======================================================

export const authApi = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await djangoFetch("/auth/pharmacist-login/", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await readError(response, `Erreur de connexion (${response.status})`));
    }

    const payload = await response.json();
    localStorage.setItem(ACCESS_TOKEN_KEY, payload.access);
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh);

    // Best effort: keep the existing Spring session alive for pharmacist AI.
    // Shared-domain operations no longer depend on this call succeeding.
    await springFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }).catch(() => undefined);

    return {
      userId: payload.userId,
      pharmacyId: payload.pharmacyId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      role: payload.role,
    };
  },

  async getCurrentUser(): Promise<LoginResponse> {
    const [userResponse, pharmacyResponse] = await Promise.all([
      djangoFetch("/users/me/"),
      djangoFetch("/pharmacies/me/"),
    ]);

    if (!userResponse.ok || !pharmacyResponse.ok) {
      throw new Error("Session pharmacien invalide.");
    }

    const user = await userResponse.json();
    const pharmacy = await pharmacyResponse.json();
    if (user.role !== "pharmacist") {
      throw new Error("Accès réservé aux pharmaciens.");
    }

    return {
      userId: user.id,
      pharmacyId: pharmacy.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
    };
  },

  async register(data: RegisterRequest): Promise<LoginResponse> {
    const response = await djangoFetch("/auth/pharmacist-signup/", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || "Erreur lors de la création du compte.");
    }
    return response.json();
  },

  async logout(): Promise<void> {
    const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (refresh) {
      await djangoFetch("/auth/logout/", {
        method: "POST",
        body: JSON.stringify({ refresh }),
      }).catch(() => undefined);
    }

    await springFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearAuthStorage();
  },
};

export async function changePassword(payload: ChangePasswordRequest) {
  if (payload.newPassword !== payload.confirmPassword) {
    throw new Error("Les nouveaux mots de passe ne correspondent pas.");
  }

  const response = await djangoFetch("/users/password/change/", {
    method: "POST",
    body: JSON.stringify({
      old_password: payload.currentPassword,
      new_password: payload.newPassword,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.old_password?.[0] ||
      data?.new_password?.[0] ||
      data?.detail ||
      "Impossible de modifier le mot de passe.",
    );
  }
  return data;
}
export const deliveryApi = {
  async getActiveAgentsCount(): Promise<number> {
    const response = await djangoFetch("/delivery/active-count/");

    if (!response.ok) {
      throw new Error(
        await readError(
          response,
          `Erreur lors du chargement des livreurs actifs: ${response.status}`,
        ),
      );
    }

    const data = await response.json();

    return Number(data.active_delivery_agents ?? 0);
  },
};