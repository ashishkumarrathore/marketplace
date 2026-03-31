import { Show, For, onMount } from "solid-js";
import { orderDetail, navigate } from "../store";
import { productEmoji, fmt, fmtDate } from "../utils";
import "./OrderDetailPage.css";

export default function OrderDetailPage() {
  const od = orderDetail;

  return (
    <div class="page-wrapper order-detail-outer">
      <Show
        when={od()}
        fallback={<div class="loading-center">Loading order details...</div>}
      >
        <div class="order-detail-container">
          {/* ── Order header ────────────────────────────────── */}
          <div class="order-detail-hero">
            <div class="order-detail-header-status">
              <Show
                when={od().status === "Confirmed"}
                fallback={
                  <div class="check-wrap pending">
                    <div class="check pending-icon">📦</div>
                  </div>
                }
              >
                <div class="check-wrap">
                  <div class="check">✓</div>
                </div>
              </Show>
            </div>
            <h1 class="order-detail-title">Order Details</h1>
            <p class="order-detail-sub">
              Order <span class="font-mono">{od().id}</span> ·{" "}
              {fmtDate(od().date)}
            </p>
            <Show when={od().email}>
              <p class="order-detail-email text-muted text-sm">
                Confirmation sent to {od().email}
              </p>
            </Show>
          </div>

          {/* ── Main order detail card ──────────────────────── */}
          <div class="order-detail-card card">
            {/* Items */}
            <div class="order-detail-section">
              <div class="order-detail-section-label">Items Ordered</div>
              <div class="order-detail-items">
                <For each={od().items || []}>
                  {(item) => (
                    <div class="order-detail-item">
                      <div class="order-detail-item-emoji">
                        {productEmoji(item)}
                      </div>
                      <div class="order-detail-item-info">
                        <div class="order-detail-item-title">{item.title}</div>
                        <Show when={item.protection_plan}>
                          <div
                            class="text-xs"
                            style={{ color: "var(--accent)" }}
                          >
                            🛡 Device Protection Plan included
                          </div>
                        </Show>
                      </div>
                      <div class="order-detail-item-qty text-muted text-sm">
                        ×{item.qty || 1}
                      </div>
                      <div class="order-detail-item-price font-mono">
                        {fmt(item.price * (item.qty || 1))}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="divider" />

            {/* Payment breakdown */}
            <div class="order-detail-section">
              <div class="order-detail-section-label">Payment Breakdown</div>
              <div class="order-detail-math">
                <div class="math-row">
                  <span class="text-muted">Subtotal</span>
                  <span class="font-mono">{fmt(od().subtotal)}</span>
                </div>
                <Show when={od().wallet_credit && od().wallet_credit < 0}>
                  <div class="math-row text-success">
                    <span>◈ Wallet Credit Applied</span>
                    <span class="font-mono">
                      −{fmt(Math.abs(od().wallet_credit))}
                    </span>
                  </div>
                </Show>
                <div class="math-row text-muted">
                  <span>
                    Tax ({((od().tax_rate || 0.053) * 100).toFixed(1)}%)
                  </span>
                  <span class="font-mono">{fmt(od().tax)}</span>
                </div>
                <div class="divider" style={{ margin: "12px 0" }} />
                <div class="math-row math-total">
                  <span>
                    Total Charged to {od().card_brand} ••••{" "}
                    {od().card_last4 ?? "••••"}
                  </span>
                  <span class="font-mono math-total-amount">
                    {fmt(od().total)}
                  </span>
                </div>
              </div>
            </div>

            <div class="divider" />

            {/* Shipping & Payment */}
            <div class="order-detail-section order-detail-two-col">
              <div>
                <div class="order-detail-section-label">Shipped To</div>
                <div class="order-detail-address">
                  <div class="font-600">{od().shipping?.name}</div>
                  <div class="text-muted">
                    {od().shipping?.street}
                    {od().shipping?.street2
                      ? `, ${od().shipping?.street2}`
                      : ""}
                  </div>
                  <div class="text-muted">
                    {od().shipping?.city}
                    {od().shipping?.city ? ", " : ""}
                    {od().shipping?.state} {od().shipping?.zip}
                  </div>
                  <Show when={od().shipping?.country}>
                    <div class="text-muted">{od().shipping?.country}</div>
                  </Show>
                  <Show when={od().shipping?.email || od().email}>
                    <div class="text-muted">
                      Confirmation sent to {od().shipping?.email || od().email}
                    </div>
                  </Show>
                </div>
              </div>
              <div>
                <div class="order-detail-section-label">Payment Method</div>
                <div class="order-detail-card-info">
                  <span>💳</span>
                  <div>
                    <div class="font-600">{od().card_brand}</div>
                    <div class="text-muted text-sm font-mono">
                      •••• •••• •••• {od().card_last4 ?? "••••"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider" />

            {/* Status tracker */}
            <div class="order-detail-section">
              <div class="order-detail-section-label">Order Status</div>
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
            <div class="order-detail-section">
              <div class="order-detail-section-label">Next Steps</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <a
                  href={`https://www.fedex.com?orderid=${od().id}`}
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
                  href={`https://www.att.com/support/article/wireless/KM1436349/?orderid=${od().id}`}
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
          <div class="order-detail-actions">
            <button
              class="btn btn-secondary btn-lg"
              onClick={() => navigate("profile")}
            >
              ← Back to Orders
            </button>
            <button
              class="btn btn-primary btn-lg"
              onClick={() => navigate("catalog")}
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
