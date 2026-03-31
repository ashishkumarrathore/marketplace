import { Show, For, onMount } from "solid-js";
import { receipt, navigate, setWalletBalance } from "../store";
import { fetchAccount } from "../api/client";
import { productEmoji, fmt, fmtDate } from "../utils";
import "./ReceiptPage.css";

export default function ReceiptPage() {
  const r = receipt;

  // Refetch account data after successful order
  onMount(async () => {
    try {
      const account = await fetchAccount();
      if (account) {
        sessionStorage.setItem("marketone_account", JSON.stringify(account));
        // Update wallet balance in global store
        if (account.walletBalance !== undefined) {
          setWalletBalance(account.walletBalance);
        }
      }
    } catch (e) {
      // ignore failures, user can still see order
    }
  });

  return (
    <div class="page-wrapper receipt-outer">
      <Show
        when={r()}
        fallback={<div class="loading-center">No receipt data.</div>}
      >
        <div class="receipt-container">
          {/* ── Confirmation header ────────────────────────────── */}
          <div class="receipt-hero">
            <div class="receipt-check-wrap">
              <div class="receipt-check">✓</div>
            </div>
            <h1 class="receipt-hero-title">Order Confirmed!</h1>
            <p class="receipt-hero-sub">
              Order <span class="font-mono">{r().id}</span> ·{" "}
              {fmtDate(r().date)}
            </p>
            <p class="receipt-hero-email text-muted text-sm">
              Confirmation sent to {r().email || "your email"}
            </p>
          </div>

          {/* ── Main receipt card ──────────────────────────────── */}
          <div class="receipt-card card">
            {/* Items */}
            <div class="receipt-section">
              <div class="receipt-section-label">Items Ordered</div>
              <div class="receipt-items">
                <For each={r().items}>
                  {(item) => (
                    <div class="receipt-item">
                      <div class="receipt-item-emoji">{productEmoji(item)}</div>
                      <div class="receipt-item-info">
                        <div class="receipt-item-title">{item.title}</div>
                        <Show when={item.protection_plan}>
                          <div
                            class="text-xs"
                            style={{ color: "var(--accent)" }}
                          >
                            🛡 Device Protection Plan included
                          </div>
                        </Show>
                      </div>
                      <div class="receipt-item-qty text-muted text-sm">
                        ×{item.qty || 1}
                      </div>
                      <div class="receipt-item-price font-mono">
                        {fmt(item.price * (item.qty || 1))}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="divider" />

            {/* Payment math */}
            <div class="receipt-section">
              <div class="receipt-section-label">Payment Breakdown</div>
              <div class="receipt-math">
                <div class="math-row">
                  <span class="text-muted">Subtotal</span>
                  <span class="font-mono">{fmt(r().subtotal)}</span>
                </div>
                <Show when={r().wallet_credit < 0}>
                  <div class="math-row text-success">
                    <span>◈ Wallet Credit Applied</span>
                    <span class="font-mono">
                      −{fmt(Math.abs(r().wallet_credit))}
                    </span>
                  </div>
                </Show>
                <div class="math-row text-muted">
                  <span>
                    Tax ({((r().tax_rate || 0.053) * 100).toFixed(1)}%)
                  </span>
                  <span class="font-mono">{fmt(r().tax)}</span>
                </div>
                <div class="divider" style={{ margin: "12px 0" }} />
                <div class="math-row math-total">
                  <span>
                    Total Charged to {r().card_brand} ••••{" "}
                    {r().card_last4 ?? "••••"}
                  </span>
                  <span class="font-mono math-total-amount">
                    {fmt(r().total)}
                  </span>
                </div>
              </div>
            </div>

            <div class="divider" />

            {/* Shipping */}
            <div class="receipt-section receipt-two-col">
              <div>
                <div class="receipt-section-label">Shipped To</div>
                <div class="receipt-address">
                  <div class="font-600">{r().shipping?.name}</div>
                  <div class="text-muted">
                    {r().shipping?.street}
                    {r().shipping?.street2 ? `, ${r().shipping?.street2}` : ""}
                  </div>
                  <div class="text-muted">
                    {r().shipping?.city}
                    {r().shipping?.city ? ", " : ""}
                    {r().shipping?.state} {r().shipping?.zip}
                  </div>
                  <Show when={r().shipping?.country}>
                    <div class="text-muted">{r().shipping?.country}</div>
                  </Show>
                  <Show when={r().shipping?.email || r().email}>
                    <div class="text-muted">
                      Confirmation sent to {r().shipping?.email || r().email}
                    </div>
                  </Show>
                </div>
              </div>
              <div>
                <div class="receipt-section-label">Payment Method</div>
                <div class="receipt-card-info">
                  <span>💳</span>
                  <div>
                    <div class="font-600">{r().card_brand}</div>
                    <div class="text-muted text-sm font-mono">
                      •••• •••• •••• {r().card_last4 ?? "••••"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider" />

            {/* Status tracker */}
            <div class="receipt-section">
              <div class="receipt-section-label">Order Status</div>
              <div class="status-track">
                {["Confirmed", "Processing", "Shipped", "Delivered"].map(
                  (step, i) => (
                    <div
                      class={`status-step ${i === 0 ? "active" : "pending"}`}
                    >
                      <div class="status-step-dot">{i === 0 ? "✓" : ""}</div>
                      <div class="status-step-label">{step}</div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div class="divider" />

            {/* Action Links */}
            <div class="receipt-section">
              <div class="receipt-section-label">Next Steps</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <a
                  href={`https://www.fedex.com?orderid=${r().id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-secondary"
                  style={{
                    textDecoration: "none",
                    textAlign: "center",
                    padding: "10px 16px",
                  }}
                >
                  📦 Track Your Item
                </a>
                <a
                  href={`https://www.att.com/support/article/wireless/KM1436349/?orderid=${r().id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-secondary"
                  style={{
                    textDecoration: "none",
                    textAlign: "center",
                    padding: "10px 16px",
                  }}
                >
                  ↩ Return Equipment
                </a>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div class="receipt-actions">
            <button
              class="btn btn-primary btn-lg"
              onClick={() => navigate("orders")}
            >
              📦 View Orders
            </button>
            <button
              class="btn btn-secondary btn-lg"
              onClick={() => navigate("catalog")}
            >
              ← Continue Shopping
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}