/**
 * store/index.js
 * Global reactive state using Solid.js createSignal + createStore.
 * Cart uses createStore for nested mutable updates (protection plans, qty).
 * All other state uses createSignal for fine-grained reactivity.
 */
import { createSignal, createMemo, createEffect } from "solid-js";
import { createStore, produce } from "solid-js/store";

// ─────────────────────────────────────────────────────────────
//  ROUTER — page signal
// ─────────────────────────────────────────────────────────────
export const [currentPage, setCurrentPage] = createSignal("catalog");
// pages: 'catalog' | 'detail' | 'checkout' | 'receipt' | 'orders' | 'profile' | 'orderDetail'

export const [selectedProduct, setSelectedProduct] = createSignal(null);
export const [receipt, setReceipt] = createSignal(null);
export const [orderDetail, setOrderDetail] = createSignal(null);

// ─────────────────────────────────────────────────────────────
//  CART — Solid.js Store (handles nested protection plan data)
// ─────────────────────────────────────────────────────────────
const CART_KEY = "marketone_cart_v1";
let _initial = { items: [] };
try {
  const raw = sessionStorage.getItem(CART_KEY);
  if (raw) _initial = JSON.parse(raw) || _initial;
} catch (e) {
  // ignore parse errors
}

export const [cartStore, setCartStore] = createStore(_initial);

// write-through persistence whenever cartStore changes
createEffect(() => {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cartStore));
  } catch (e) {
    // ignore storage errors (e.g., quota)
  }
});

export const addToCart = (product, protectionPlan = null) => {
  setCartStore(
    produce((s) => {
      const key = product.id + (protectionPlan ? "_protected" : "");
      const existing = s.items.find((i) => i._key === key);
      if (existing) {
        existing.qty += 1;
      } else {
        s.items.push({
          _key: key,
          id: product.id,
          platform_id: product.platform_id,
          title: product.title,
          subtitle: product.subtitle,
          price: product.price,
          product_type: product.product_type,
          qty: 1,
          protection_plan: protectionPlan
            ? { price: 12.99, terms_accepted: true }
            : null,
        });
      }
    }),
  );
};

export const removeFromCart = (key) => {
  setCartStore("items", (items) => items.filter((i) => i._key !== key));
};

export const updateQty = (key, qty) => {
  if (qty < 1) {
    removeFromCart(key);
    return;
  }
  setCartStore(
    produce((s) => {
      const item = s.items.find((i) => i._key === key);
      if (item) item.qty = qty;
    }),
  );
};

export const clearCart = () => setCartStore("items", []);

// Remove protection from a protected cart item and merge into an unprotected item
export const removeProtectionFromItem = (protectedKey) => {
  setCartStore(
    produce((s) => {
      const idx = s.items.findIndex((i) => i._key === protectedKey);
      if (idx === -1) return;
      const item = s.items[idx];
      if (!item.protection_plan) return;
      // base key without the '_protected' suffix
      const baseKey = protectedKey.replace(/_protected$/, "");
      // remove protected item
      s.items.splice(idx, 1);
      // attempt to find an existing unprotected item
      const existing = s.items.find((i) => i._key === baseKey);
      if (existing) {
        existing.qty += item.qty;
      } else {
        s.items.push({
          ...item,
          _key: baseKey,
          protection_plan: null,
        });
      }
    }),
  );
};

// Add protection to an unprotected cart item (merge if protected exists)
export const addProtectionToItem = (baseKey) => {
  setCartStore(
    produce((s) => {
      const idx = s.items.findIndex((i) => i._key === baseKey);
      if (idx === -1) return;
      const item = s.items[idx];
      if (item.protection_plan) return; // already protected
      const protectedKey = `${baseKey}_protected`;
      // remove base item
      s.items.splice(idx, 1);
      // find existing protected item
      const existing = s.items.find((i) => i._key === protectedKey);
      if (existing) {
        existing.qty += item.qty;
      } else {
        s.items.push({
          ...item,
          _key: protectedKey,
          protection_plan: { price: 12.99, terms_accepted: true },
        });
      }
    }),
  );
};

// ─────────────────────────────────────────────────────────────
//  CART DERIVED MEMOS
// ─────────────────────────────────────────────────────────────
export const cartCount = createMemo(() =>
  cartStore.items.reduce((sum, i) => sum + i.qty, 0),
);

export const cartSubtotal = createMemo(() =>
  cartStore.items.reduce(
    (sum, i) =>
      sum +
      i.price * i.qty +
      (i.protection_plan ? i.protection_plan.price * i.qty : 0),
    0,
  ),
);

// ─────────────────────────────────────────────────────────────
//  WALLET
// ─────────────────────────────────────────────────────────────
export const [walletBalance, setWalletBalance] = createSignal(125.0);

// user/auth (lightweight compatibility layer)
const _savedUser = (() => {
  try {
    const raw = localStorage.getItem("mo_user");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
})();

export const [currentUser, setCurrentUser] = createSignal(_savedUser);
export const isLoggedIn = () => !!currentUser();

export const saveUser = (user) => {
  setCurrentUser(user);
  try {
    setWalletBalance(user?.wallet?.balance ?? walletBalance());
    localStorage.setItem("mo_user", JSON.stringify(user));
    if (user && user.token) localStorage.setItem("mo_token", user.token);
  } catch (e) {
    // ignore storage errors
  }
};

export const logout = () => {
  setCurrentUser(null);
  setWalletBalance(0);
  try {
    setCartStore("items", []);
  } catch (e) {
    // ignore
  }
  try {
    localStorage.removeItem("mo_user");
    localStorage.removeItem("mo_token");
    sessionStorage.removeItem("marketone_token");
  } catch (e) {
    // ignore
  }
  setCurrentPage("login");
};

// ─────────────────────────────────────────────────────────────
//  UI STATE
// ─────────────────────────────────────────────────────────────
export const [cartOpen, setCartOpen] = createSignal(false);
export const [toasts, setToasts] = createSignal([]);

let _toastId = 0;
export const showToast = (message, type = "success") => {
  const id = ++_toastId;
  setToasts((t) => [...t, { id, message, type }]);
  setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
};

// ─────────────────────────────────────────────────────────────
//  NAVIGATION HELPERS
// ─────────────────────────────────────────────────────────────
const pageToPath = (page) => {
  if (!page || page === "catalog") return "/";
  return `/${page}`;
};

export const navigate = (page, data = null) => {
  if (page === "detail" && data) setSelectedProduct(data);
  if (page === "receipt" && data) setReceipt(data);
  if (page === "orderDetail" && data) setOrderDetail(data);
  const path = pageToPath(page);
  try {
    window.history.pushState({ page }, "", path);
  } catch (e) {
    // ignore (e.g., SSR or restricted environment)
  }
  setCurrentPage(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// sync current page with the browser location on load and handle back/forward
if (typeof window !== "undefined") {
  const syncFromLocation = () => {
    const raw = window.location.pathname || "/";
    const p = raw.replace(/^\/+/, "").split("/")[0];
    const page = p === "" ? "catalog" : p;
    setCurrentPage(page);
  };
  // run once on module load
  syncFromLocation();
  window.addEventListener("popstate", () => {
    syncFromLocation();
  });

  // Ensure token-aware landing: if no token, show login page by default
  const token = sessionStorage.getItem("marketone_token");
  if (!token) {
    setCurrentPage("login");
  }
}
