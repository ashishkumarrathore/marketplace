import { createResource, For, Show } from "solid-js";
import { fetchOrders, fetchOrder } from "../api/client";
import { fmt, fmtDate } from "../utils";
import { navigate, setOrderDetail } from "../store";
import "./OrdersPage.css";

export default function OrdersPage() {
  const [orders, { refetch }] = createResource(fetchOrders);

  const orderList = () => orders()?.orders || [];

  const handleOrderClick = async (orderId) => {
    try {
      const detail = await fetchOrder(orderId);
      setOrderDetail(detail);
      navigate("orderDetail");
    } catch (err) {
      console.error("Failed to fetch order detail:", err);
    }
  };

  return (
    <div class="page-wrapper">
      <div class="page-header">
        <h1 class="page-title">📦 Order History</h1>
        <p class="page-subtitle">Track and review your past orders</p>
      </div>

      <div class="orders-layout">
        {/* List */}
        <div class="orders-list-panel">
          <Show when={orders.loading}>
            <div class="loading-center">
              <div class="spinner" /> Loading orders…
            </div>
          </Show>
          <Show when={orders.error}>
            <div class="loading-center" style={{ color: "var(--danger)" }}>
              ⚠ {orders.error?.message}
            </div>
          </Show>

          <Show when={!orders.loading && orderList().length === 0}>
            <div class="empty-state">
              <div class="empty-state-icon">📦</div>
              <div class="empty-state-title">No orders yet</div>
              <p class="text-muted text-sm">
                Your completed orders will appear here
              </p>
            </div>
          </Show>

          <For each={orderList()}>
            {(o) => (
              <div
                class="order-row card"
                onClick={() => handleOrderClick(o.id)}
              >
                <div class="order-row-id font-mono">{o.id}</div>
                <div class="order-row-body">
                  <div class="order-row-title">{o.first_item}</div>
                  <div class="order-row-meta text-muted text-sm">
                    {fmtDate(o.date)} · {o.item_count} item
                    {o.item_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div class="order-row-right">
                  <span class={`badge status-${o.status}`}>{o.status}</span>
                  <span class="order-row-total font-mono">{fmt(o.total)}</span>
                  <span class="order-row-chevron">›</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
