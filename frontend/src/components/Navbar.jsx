import { createSignal, Show } from "solid-js";
import {
  navigate,
  currentPage,
  cartCount,
  walletBalance,
  setCartOpen,
  logout,
} from "../store";
import "./Navbar.css";

export default function Navbar(props) {
  const [mobileOpen, setMobileOpen] = createSignal(false);

  const navLinks = [
    { id: "catalog", label: "Catalog" },
    { id: "profile", label: "My Account" },
  ];

  return (
    <nav class="navbar">
      <div class="navbar-inner">
        {/* Logo */}
        <button class="navbar-logo" onClick={() => navigate("catalog")}>
          <span class="logo-mark">◈</span>
          <span class="logo-text">Marketplace</span>
        </button>

        {/* Desktop links (hidden on login page) */}
        <Show when={currentPage() !== "login"}>
          <div class="navbar-links">
            {navLinks.map((l) => (
              <button
                class={`navbar-link ${currentPage() === l.id ? "active" : ""}`}
                onClick={() => navigate(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Show>

        {/* Right controls (hidden on login page) */}
        <Show when={currentPage() !== "login"}>
          <div class="navbar-right">
            {/* API status indicator */}
            <div
              class={`api-indicator ${props.backendOnline ? "online" : "offline"}`}
              title={props.backendOnline ? "API connected" : "Demo mode"}
            >
              <span class="indicator-dot" />
              <span class="indicator-label">
                {props.backendOnline ? "Live" : "Demo"}
              </span>
            </div>

            {/* Wallet pill */}
            <div class="wallet-pill">
              <span class="wallet-icon">◈</span>
              <span class="wallet-amount font-mono">
                ${walletBalance().toFixed(2)}
              </span>
            </div>

            {/* Cart button */}
            <button
              class="cart-btn"
              onClick={() => setCartOpen(true)}
              aria-label="Open cart"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                style={{ marginRight: "6px", color: "#fff" }}
                aria-hidden="true"
              >
                <path
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <circle cx="10" cy="20" r="1" fill="currentColor" />
                <circle cx="18" cy="20" r="1" fill="currentColor" />
              </svg>
              <span>Cart</span>
              {cartCount() > 0 && <span class="cart-badge">{cartCount()}</span>}
            </button>

            {/* Logout button */}
            <button
              class="logout-btn"
              title="Logout"
              onClick={() => {
                try {
                  sessionStorage.removeItem("userToken");
                  sessionStorage.removeItem("marketone_user");
                  sessionStorage.removeItem("marketone_profile");
                  sessionStorage.removeItem("marketone_account");
                } catch (e) {}
                try {
                  localStorage.removeItem("mo_user");
                  localStorage.removeItem("mo_token");
                } catch (e) {}
                setMobileOpen(false);
                logout();
              }}
              aria-label="Logout"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              <span>Logout</span>
            </button>

            {/* Mobile hamburger */}
            <button class="hamburger" onClick={() => setMobileOpen((v) => !v)}>
              <span />
              <span />
              <span />
            </button>
          </div>
        </Show>
      </div>

      {/* Mobile menu */}
      {mobileOpen() && (
        <div class="mobile-menu">
          {navLinks.map((l) => (
            <button
              class={`mobile-link ${currentPage() === l.id ? "active" : ""}`}
              onClick={() => {
                navigate(l.id);
                setMobileOpen(false);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
