import { Show, Switch, Match, createSignal, onMount } from "solid-js";
import { currentPage, cartOpen, setCartOpen, toasts, showToast } from "./store";
import { checkHealth } from "./api/client";
import Navbar from "./components/Navbar";
import CartPanel from "./components/CartPanel";
import CatalogPage from "./pages/CatalogPage";
import DetailPage from "./pages/DetailPage";
import CheckoutPage from "./pages/CheckoutPage";
import ReceiptPage from "./pages/ReceiptPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import OrdersPage from "./pages/OrdersPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import "./styles/global.css";

export default function App() {
  const [backendOnline, setBackendOnline] = createSignal(false);
  const [backendChecked, setBackendChecked] = createSignal(false);

  onMount(async () => {
    try {
      await checkHealth();
      setBackendOnline(true);
      showToast("✓ Connected to MarketOne API", "success");
    } catch {
      setBackendOnline(false);
      showToast("⚠ Running in demo mode — start the FastAPI backend", "info");
    }
    setBackendChecked(true);
  });

  return (
    <>
      {/* ── Nav ─────────────────────────────────────────────── */}
      <Navbar backendOnline={backendOnline()} />

      {/* ── Page router ─────────────────────────────────────── */}
      <main>
        <Switch>
          <Match when={currentPage() === "catalog"}>
            <CatalogPage />
          </Match>
          <Match when={currentPage() === "detail"}>
            <DetailPage />
          </Match>
          <Match when={currentPage() === "checkout"}>
            <CheckoutPage />
          </Match>
          <Match when={currentPage() === "receipt"}>
            <ReceiptPage />
          </Match>
          <Match when={currentPage() === "orderDetail"}>
            <OrderDetailPage />
          </Match>
          <Match when={currentPage() === "orders"}>
            <OrdersPage />
          </Match>
          <Match when={currentPage() === "profile"}>
            <ProfilePage />
          </Match>
          <Match when={currentPage() === "login"}>
            <LoginPage />
          </Match>
        </Switch>
      </main>

      {/* ── Cart slide-over ──────────────────────────────────── */}
      <Show when={cartOpen()}>
        <div class="overlay" onClick={() => setCartOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", right: 0, top: 0, bottom: 0 }}
          >
            <CartPanel />
          </div>
        </div>
      </Show>

      {/* ── Toast container ──────────────────────────────────── */}
      <div class="toast-container">
        {toasts().map((t) => (
          <div class={`toast toast-${t.type}`}>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
