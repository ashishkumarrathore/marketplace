import { Show, For } from "solid-js";
import {
  cartStore,
  cartCount,
  cartSubtotal,
  walletBalance,
  removeFromCart,
  updateQty,
  navigate,
  setCartOpen,
} from "../store";
import { productEmoji, fmt } from "../utils";
import "./CartPanel.css";

export default function CartPanel() {
  const estimatedTotal = () => cartSubtotal() + cartSubtotal() * 0.053;

  return (
    <div class="cart-panel">
      {/* Header */}
      <div class="cart-header">
        <h2 class="cart-title">
          🛒 Cart
          <Show when={cartCount() > 0}>
            <span class="cart-count-badge">{cartCount()}</span>
          </Show>
        </h2>
        <button
          class="btn btn-icon btn-ghost"
          onClick={() => setCartOpen(false)}
        >
          ✕
        </button>
      </div>

      {/* Items */}
      <div class="cart-items">
        <Show
          when={cartStore.items.length > 0}
          fallback={
            <div class="empty-state">
              <div class="empty-state-icon">🛒</div>
              <div class="empty-state-title">Your cart is empty</div>
              <p class="text-muted text-sm">Browse the catalog to add items</p>
              <button
                class="btn btn-primary btn-sm"
                onClick={() => {
                  setCartOpen(false);
                  navigate("catalog");
                }}
              >
                Browse Catalog
              </button>
            </div>
          }
        >
          <For each={cartStore.items}>
            {(item) => (
              <div class="cart-item">
                <div class="cart-item-emoji">{productEmoji(item)}</div>
                <div class="cart-item-info">
                  <div class="cart-item-title">{item.title}</div>
                  <div class="cart-item-meta">
                    <span class="text-muted text-sm">{item.subtitle}</span>
                    <Show when={item.protection_plan}>
                      <span class="prot-tag">🛡 Protected</span>
                    </Show>
                  </div>
                  {/* Qty controls */}
                  <div class="qty-controls">
                    <button
                      class="qty-btn"
                      onClick={() => updateQty(item._key, item.qty - 1)}
                    >
                      −
                    </button>
                    <span class="qty-value">{item.qty}</span>
                    <button
                      class="qty-btn"
                      onClick={() => updateQty(item._key, item.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div class="cart-item-right">
                  <div class="cart-item-price font-mono">
                    {fmt(
                      item.price * item.qty +
                        (item.protection_plan
                          ? item.protection_plan.price * item.qty
                          : 0),
                    )}
                  </div>
                  <button
                    class="remove-btn"
                    onClick={() => removeFromCart(item._key)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* Footer */}
      <Show when={cartStore.items.length > 0}>
        <div class="cart-footer">
          <div class="cart-totals">
            <div class="total-row">
              <span class="text-muted">Subtotal</span>
              <span class="font-mono">{fmt(cartSubtotal())}</span>
            </div>
            <div class="total-row muted-row">
              <span class="text-muted">Est. Tax (5.3%)</span>
              <span class="font-mono text-muted">
                {fmt(cartSubtotal() * 0.053)}
              </span>
            </div>
            <div class="divider" style={{ margin: "10px 0" }} />
            <div class="total-row grand-total">
              <span>Est. Total</span>
              <span class="font-mono">{fmt(estimatedTotal())}</span>
            </div>
          </div>

          <button
            class="btn btn-primary btn-lg w-full"
            onClick={() => {
              setCartOpen(false);
              navigate("checkout");
            }}
          >
            Proceed to Checkout →
          </button>

          <button
            class="btn btn-ghost btn-sm w-full"
            style={{ "margin-top": "8px" }}
            onClick={() => {
              setCartOpen(false);
              navigate("catalog");
            }}
          >
            Continue Shopping
          </button>
        </div>
      </Show>
    </div>
  );
}
