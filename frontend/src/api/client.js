/**
 * api/client.js
 * Axios-based API client wired to FastAPI backend via /api proxy.
 * All endpoints map 1:1 to FastAPI routes.
 */
// import axios from "axios";

// const http = axios.create({
//   baseURL: "/api",
//   timeout: 15_000,
//   headers: { "Content-Type": "application/json" },
// });

/**
 * api/client.js
 * Axios-based API client wired to FastAPI backend via /api proxy.
 * All endpoints map 1:1 to FastAPI routes.
 */
import axios from "axios";

// ✅ Only change: use env variable in production, fallback to "/api" for local dev
const http = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ""}/api`,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Response interceptor: unwrap data, normalise errors ──────
http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      "Unknown error";
    return Promise.reject(new Error(msg));
  },
);

// attach token automatically from sessionStorage for API requests
http.interceptors.request.use((cfg) => {
  try {
    const t =
      sessionStorage.getItem("userToken") ||
      sessionStorage.getItem("marketone_token");
    if (t)
      cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${t}` };
  } catch (e) {
    // ignore
  }
  return cfg;
});

// ─── Catalog ──────────────────────────────────────────────────
export const fetchProducts = (params = {}) => http.get("/products", { params });

export const fetchProduct = (id) => http.get(`/products/${id}`);

// return the eligible catalog mapping used to filter marketplace listings
export const fetchEligibleCatalog = () => http.get("/catalog");

// ─── Wallet ───────────────────────────────────────────────────
export const fetchWallet = () => http.get("/wallet");

export const fetchCards = () => http.get("/wallet/cards");

export const addCard = (payload) => http.post("/wallet/cards", payload);

// Authentication
export const postLogin = (payload) => http.post("/login", payload);
export const fetchProfile = () => http.get("/profile");
export const postLogout = () => http.post("/logout");
// backwards-compatible alias
export const fetchMe = (token) => {
  // older endpoint — prefer /profile with bearer token
  return http.get("/users/me", { params: { token } });
};

// Account (checkout prefill)
export const fetchAccount = () => http.get("/account");

// ─── Orders ───────────────────────────────────────────────────
export const fetchOrders = () => http.get("/orders");

export const fetchOrder = (id) => http.get(`/orders/${id}`);

export const fetchOrderDetail = (id) => http.get(`/orders/${id}`);

// ─── Checkout ─────────────────────────────────────────────────
export const postCheckout = (payload) => http.post("/checkout", payload);

// ─── Health ───────────────────────────────────────────────────
export const checkHealth = () => http.get("/health");
