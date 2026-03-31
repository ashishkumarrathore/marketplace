import {
  createSignal,
  createResource,
  For,
  Show,
  createEffect,
} from "solid-js";
import { fetchOrders, fetchWallet, fetchOrderDetail } from "../api/client";
import { walletBalance, navigate } from "../store";
import { fmt, fmtDate } from "../utils";
import "./ProfilePage.css";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = createSignal("orders");
  const [userInfo, setUserInfo] = createSignal({ name: "", email: "" });

  const [orders] = createResource(fetchOrders);
  const [wallet] = createResource(fetchWallet);

  const orderList = () => orders()?.orders || [];
  const walletData = () => wallet() || {};

  // Load user info from sessionStorage on mount
  createEffect(() => {
    try {
      const profileJson = sessionStorage.getItem("marketone_profile");
      if (profileJson) {
        const profile = JSON.parse(profileJson);
        if (profile.user) {
          // Extract name from username or use email
          const name = profile.user.username || profile.user.email || "User";
          setUserInfo({
            name: name,
            email: profile.user.email || "",
          });
        }
      }
    } catch (e) {}
  });

  // All ledger entries merged and sorted newest-first
  const ledger = () => {
    const w = walletData();
    // Get grants and usage from wallet endpoint
    const grants = (w.grants || []).map((g) => ({ ...g, kind: "credit" }));
    const usage = (w.usage || []).map((u) => ({ ...u, kind: "debit" }));
    return [...grants, ...usage].sort((a, b) => {
      // Parse dates properly - they might be ISO strings or YYYY-MM-DD format
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA; // newest first
    });
  };

  // Get initials for avatar
  const getInitials = () => {
    const name = userInfo().name || "User";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div class="page-wrapper">
      {/* ── Profile header ─────────────────────────────────── */}
      <div class="profile-header card card-padded">
        <div class="profile-avatar">{getInitials()}</div>
        <div class="profile-info">
          <div class="profile-name">{userInfo().name || "User"}</div>
          <div class="profile-email text-muted">
            {userInfo().email || "user@example.com"}
          </div>
          <div class="profile-badges">
            <span class="badge badge-accent">◈ Premium Member</span>
            <span class="badge badge-success">✓ Verified</span>
          </div>
        </div>
        <div class="profile-stats">
          <div class="profile-stat">
            <div class="profile-stat-val font-mono">{orderList().length}</div>
            <div class="profile-stat-label text-muted text-xs">Orders</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-val font-mono text-accent2">
              {fmt(walletBalance())}
            </div>
            <div class="profile-stat-label text-muted text-xs">Wallet</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div class="tabs">
        <button
          class={`tab-btn ${activeTab() === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          📦 Order History
        </button>
        <button
          class={`tab-btn ${activeTab() === "wallet" ? "active" : ""}`}
          onClick={() => setActiveTab("wallet")}
        >
          ◈ Digital Wallet
        </button>
      </div>

      {/* ── Orders tab ─────────────────────────────────────── */}
      <Show when={activeTab() === "orders"}>
        <div class="tab-content">
          <Show when={orders.loading}>
            <div class="loading-center">
              <div class="spinner" /> Loading…
            </div>
          </Show>
          <Show when={!orders.loading && orderList().length === 0}>
            <div class="empty-state">
              <div class="empty-state-icon">📦</div>
              <div class="empty-state-title">No orders yet</div>
            </div>
          </Show>
          <div class="profile-orders-list">
            <For each={orderList()}>
              {(o) => (
                <div
                  class="profile-order-row card"
                  style={{ cursor: "pointer" }}
                  onClick={async () => {
                    const detail = await fetchOrderDetail(o.id);
                    navigate("orderDetail", detail);
                  }}
                >
                  <div class="por-emoji">📦</div>
                  <div class="por-body">
                    <div class="por-title">{o.first_item}</div>
                    <div class="por-meta text-muted text-sm">
                      <span
                        class="font-mono"
                        style={{ color: "var(--text-soft)" }}
                      >
                        {o.id}
                      </span>
                      {" · "}
                      {fmtDate(o.date)}
                      {" · "}
                      {o.item_count} item{o.item_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div class="por-right">
                    <span class={`badge status-${o.status}`}>{o.status}</span>
                    <span
                      class="font-mono"
                      style={{ color: "var(--accent2)", "font-size": "0.9rem" }}
                    >
                      {fmt(o.total)}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* ── Wallet tab ──────────────────────────────────────── */}
      <Show when={activeTab() === "wallet"}>
        <div class="tab-content">
          {/* Balance hero */}
          <div class="wallet-hero card">
            <div class="wallet-hero-inner">
              <div class="wallet-hero-icon">◈</div>
              <div>
                <div
                  class="wallet-hero-label text-muted text-xs"
                  style={{
                    "text-transform": "uppercase",
                    "letter-spacing": "0.1em",
                    "font-weight": "700",
                  }}
                >
                  Available Balance
                </div>
                <div class="wallet-hero-amount font-mono">
                  {fmt(walletBalance())}
                </div>
              </div>
            </div>
            <Show when={(walletData().upcoming_expirations || []).length > 0}>
              <div class="wallet-expiry-strip">
                <For each={walletData().upcoming_expirations || []}>
                  {(ex) => (
                    <div class="expiry-item">
                      <span class="text-warning">⚠</span>
                      <span class="text-sm">
                        {fmt(ex.amount)} expires {ex.expires}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Ledger */}
          <div
            class="wallet-ledger card card-padded"
            style={{ "margin-top": "16px" }}
          >
            <div class="section-title" style={{ "margin-bottom": "4px" }}>
              Transaction History
            </div>
            <Show when={wallet.loading}>
              <div class="loading-center" style={{ padding: "30px" }}>
                <div class="spinner" />
              </div>
            </Show>
            <div class="ledger-list">
              <For each={ledger()}>
                {(tx) => (
                  <div class="ledger-row">
                    <div class={`ledger-icon-wrap ${tx.kind}`}>
                      {tx.kind === "credit" ? "+" : "−"}
                    </div>
                    <div class="ledger-body">
                      <div class="ledger-reason">{tx.reason}</div>
                      <div class="ledger-meta text-muted text-xs">
                        {fmtDate(tx.date)}
                        <Show when={tx.expires}> · Expires {tx.expires}</Show>
                      </div>
                    </div>
                    <div
                      class={`ledger-amount font-mono ${tx.kind === "credit" ? "text-success" : "text-danger"}`}
                    >
                      {tx.kind === "credit" ? "+" : "−"}
                      {fmt(Math.abs(tx.amount))}
                    </div>
                  </div>
                )}
              </For>
              <Show when={ledger().length === 0 && !wallet.loading}>
                <div class="empty-state" style={{ padding: "40px" }}>
                  <div class="empty-state-title">No transactions yet</div>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
