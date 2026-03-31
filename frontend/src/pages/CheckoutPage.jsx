import {
  createSignal,
  createResource,
  Show,
  For,
  createEffect,
  onMount,
} from "solid-js";
import { fetchCards, postCheckout } from "../api/client";
import {
  cartStore,
  cartSubtotal,
  walletBalance,
  setWalletBalance,
  clearCart,
  navigate,
  showToast,
  removeProtectionFromItem,
  addProtectionToItem,
} from "../store";
import { productEmoji, fmt, taxRate, cardBrandEmoji } from "../utils";
import NewCardModal from "../components/NewCardModal";
import "./CheckoutPage.css";

export default function CheckoutPage() {
  // Form state
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [street, setStreet] = createSignal("");
  const [city, setCity] = createSignal("");
  const [state, setState] = createSignal("VA");
  const [zip, setZip] = createSignal("");
  const [cardId, setCardId] = createSignal("");
  const [placing, setPlacing] = createSignal(false);
  const [errors, setErrors] = createSignal({});
  const [showModal, setShowModal] = createSignal(false);
  // shipping method
  const [shippingMethod, setShippingMethod] = createSignal("standard");
  // whether user wants to apply wallet credit to this order
  const [applyWallet, setApplyWallet] = createSignal(walletBalance() > 0);

  // Load saved cards from API
  const [cardsData, { refetch: refetchCards }] = createResource(fetchCards);
  const savedCards = () => cardsData()?.cards || [];

  // On mount: prefill form fields from stored account data
  onMount(() => {
    try {
      const accountJson = sessionStorage.getItem("marketone_account");
      if (accountJson) {
        const account = JSON.parse(accountJson);

        // Sync wallet balance from account.credit.currency_amounts[0].amount
        try {
          const walletAmount = account?.credit?.currency_amounts?.[0]?.amount;
          if (walletAmount !== undefined && walletAmount !== null) {
            setWalletBalance(walletAmount);
            setApplyWallet(walletAmount > 0);
          }
        } catch (e) {}

        // Prefill email from profile if available
        try {
          const profileJson = sessionStorage.getItem("marketone_profile");
          if (profileJson) {
            const profile = JSON.parse(profileJson);
            if (profile.user?.email && !email()) {
              setEmail(profile.user.email);
            }
          }
        } catch (e) {}

        // Prefill shipping address from account.attributes.bssAccounts[0].addresses[0]
        try {
          const addr = account?.attributes?.bssAccounts?.[0]?.addresses?.[0];
          if (addr) {
            if (addr.line1 && !street()) setStreet(addr.line1);
            if (addr.city && !city()) setCity(addr.city);
            if (addr.district && !state()) setState(addr.district);
            if (addr.postalCode && !zip()) setZip(addr.postalCode);
          }
        } catch (e) {}
      }
    } catch (e) {
      // ignore errors loading account data
    }
  });

  // Additional effect for prefilling if account data loads after component
  createEffect(() => {
    try {
      const accountJson = sessionStorage.getItem("marketone_account");
      if (accountJson) {
        const account = JSON.parse(accountJson);

        // Prefill shipping address from account.attributes.bssAccounts[0].addresses[0]
        try {
          const addr = account?.attributes?.bssAccounts?.[0]?.addresses?.[0];
          if (addr) {
            if (addr.line1 && !street()) setStreet(addr.line1);
            if (addr.city && !city()) setCity(addr.city);
            if (addr.district && !state()) setState(addr.district);
            if (addr.postalCode && !zip()) setZip(addr.postalCode);
          }
        } catch (e) {}
      }
    } catch (e) {}
  });

  // Select first card once loaded
  createEffect(() => {
    const c = savedCards();
    if (c.length && !cardId())
      setCardId(c.find((x) => x.is_default)?.id || c[0]?.id || "");
  });

  // Clear field-specific errors as user corrects inputs
  createEffect(() => {
    const e = errors();
    if (!e || Object.keys(e).length === 0) return;
    const clear = (key, cond) => {
      if (e[key] && cond) {
        const next = { ...e };
        delete next[key];
        setErrors(next);
      }
    };
    clear("email", email().includes("@"));
    clear("name", !!name().trim());
    clear("street", !!street().trim());
    clear("city", !!city().trim());
    clear("state", !!state().trim());
    clear("zip", /^\d{5}(-\d{4})?$/.test(zip()));
    clear("card", !!cardId());
  });

  // Derived financials
  // avoid shadowing or duplicate 'rate' declarations elsewhere
  const taxRateValue = () => taxRate(state());
  const subtotal = () => cartSubtotal();
  const shippingCost = () => {
    // only 'standard' exists for now and is free
    return shippingMethod() === "standard" ? 0 : 0;
  };

  // allow user to pick an amount of wallet credit to apply (or none)
  const [walletAmount, setWalletAmount] = createSignal(null);
  // initialize and clamp walletAmount relative to walletBalance and subtotal
  createEffect(() => {
    const max = Math.max(0, Math.min(walletBalance(), subtotal()));
    if (walletAmount() === null) {
      setWalletAmount(max);
    } else if (walletAmount() > max) {
      setWalletAmount(max);
    }
  });

  const walletDisc = () =>
    applyWallet()
      ? Math.max(0, Math.min(walletAmount() || 0, walletBalance(), subtotal()))
      : 0;
  const taxAmount = () =>
    (subtotal() - walletDisc() + shippingCost()) * taxRateValue();
  const total = () => subtotal() - walletDisc() + shippingCost() + taxAmount();

  const validate = () => {
    const e = {};
    if (!email().includes("@")) e.email = "Enter a valid email";
    if (!name().trim()) e.name = "Name is required";
    if (!street().trim()) e.street = "Street is required";
    if (!city().trim()) e.city = "City is required";
    if (!state().trim()) e.state = "State is required";
    if (!/^\d{5}(-\d{4})?$/.test(zip())) e.zip = "Valid ZIP required";
    if (!cardId()) e.card = "Select a payment method";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePlaceOrder = async () => {
    if (!validate()) {
      showToast("⚠ Please fix form errors", "error");
      return;
    }
    if (cartStore.items.length === 0) {
      showToast("⚠ Cart is empty", "error");
      return;
    }

    setPlacing(true);
    try {
      const payload = {
        email: email(),
        shipping: {
          name: name(),
          street: street(),
          city: city(),
          state: state(),
          zip: zip(),
        },
        card_id: cardId(),
        shipping_method: shippingMethod(),
        items: cartStore.items.map((i) => ({
          id: i.id,
          title: i.title,
          price: i.price,
          qty: i.qty,
          protection_plan: !!i.protection_plan,
        })),
        use_wallet_credit: applyWallet(),
        wallet_amount_to_apply: walletDisc(), // Send the actual amount user selected
      };

      // find selected saved card details (to surface last4 if backend doesn't)
      const selCard = savedCards().find((c) => c.id === cardId());

      const receipt = await postCheckout(payload);

      // ensure receipt contains shipping/email/card info — prefer backend, fall back to payload/selected card
      const finalReceipt =
        receipt && typeof receipt === "object"
          ? {
              ...receipt,
              email: receipt.email || payload.email,
              shipping: receipt.shipping || payload.shipping,
              card_brand:
                receipt.card_brand ||
                selCard?.brand ||
                receipt.card_brand ||
                "",
              card_last4:
                receipt.card_last4 ||
                selCard?.last4 ||
                receipt.card_last4 ||
                "",
            }
          : {
              id: `ORD-${Date.now()}`,
              date: new Date().toISOString(),
              subtotal: subtotal(),
              wallet_credit: applyWallet() ? -walletDisc() : 0,
              tax: taxAmount(),
              total: total(),
              items: cartStore.items,
              email: payload.email,
              shipping: payload.shipping,
              card_brand: selCard?.brand || "",
              card_last4: selCard?.last4 || "",
            };

      try {
        setWalletBalance((b) =>
          Math.max(0, b + (finalReceipt.wallet_credit || 0)),
        );
      } catch (e) {
        // ignore wallet update failures
      }
      clearCart();
      navigate("receipt", finalReceipt);
    } catch (err) {
      showToast(`✕ Checkout failed: ${err.message}`, "error");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div class="page-wrapper">
      <button class="back-btn" onClick={() => navigate("catalog")}>
        ← Continue Shopping
      </button>

      <div class="page-header">
        <h1 class="page-title">Checkout</h1>
      </div>

      <div class="checkout-layout">
        {/* ── LEFT: Forms ─────────────────────────────────────── */}
        <div class="checkout-forms">
          {/* Step 1: Contact */}
          <div class="card card-padded checkout-section">
            <div class="section-title">
              <span class="section-num">1</span> Contact Information
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input
                class={`input-field ${errors().email ? "input-error" : ""}`}
                type="email"
                placeholder="you@example.com"
                value={email()}
                onInput={(e) => setEmail(e.target.value)}
              />
              <Show when={errors().email}>
                <div class="form-error">{errors().email}</div>
              </Show>
            </div>
          </div>

          {/* Step 2: Shipping */}
          <div class="card card-padded checkout-section">
            <div class="section-title">
              <span class="section-num">2</span> Shipping Address
            </div>
            <div class="form-grid">
              <div class="form-group full">
                <label class="form-label">Full Name</label>
                <input
                  class={`input-field ${errors().name ? "input-error" : ""}`}
                  placeholder="Alex Johnson"
                  value={name()}
                  onInput={(e) => setName(e.target.value)}
                />
                <Show when={errors().name}>
                  <div class="form-error">{errors().name}</div>
                </Show>
              </div>
              <div class="form-group full">
                <label class="form-label">Street Address</label>
                <input
                  class={`input-field ${errors().street ? "input-error" : ""}`}
                  placeholder="123 Main Street"
                  value={street()}
                  onInput={(e) => setStreet(e.target.value)}
                />
                <Show when={errors().street}>
                  <div class="form-error">{errors().street}</div>
                </Show>
              </div>
              <div class="form-group">
                <label class="form-label">City</label>
                <input
                  class={`input-field ${errors().city ? "input-error" : ""}`}
                  placeholder="Springfield"
                  value={city()}
                  onInput={(e) => setCity(e.target.value)}
                />
                <Show when={errors().city}>
                  <div class="form-error">{errors().city}</div>
                </Show>
              </div>
              <div class="form-group">
                <label class="form-label">State</label>
                <select
                  class={`select-field ${errors().state ? "input-error" : ""}`}
                  value={state()}
                  onChange={(e) => setState(e.target.value)}
                >
                  {[
                    "AL",
                    "AK",
                    "AZ",
                    "AR",
                    "CA",
                    "CO",
                    "CT",
                    "DE",
                    "FL",
                    "GA",
                    "HI",
                    "ID",
                    "IL",
                    "IN",
                    "IA",
                    "KS",
                    "KY",
                    "LA",
                    "ME",
                    "MD",
                    "MA",
                    "MI",
                    "MN",
                    "MS",
                    "MO",
                    "MT",
                    "NE",
                    "NV",
                    "NH",
                    "NJ",
                    "NM",
                    "NY",
                    "NC",
                    "ND",
                    "OH",
                    "OK",
                    "OR",
                    "PA",
                    "RI",
                    "SC",
                    "SD",
                    "TN",
                    "TX",
                    "UT",
                    "VT",
                    "VA",
                    "WA",
                    "WV",
                    "WI",
                    "WY",
                  ].map((s) => (
                    <option value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">ZIP Code</label>
                <input
                  class={`input-field ${errors().zip ? "input-error" : ""}`}
                  placeholder="22150"
                  maxlength="10"
                  value={zip()}
                  onInput={(e) => setZip(e.target.value)}
                />
                <Show when={errors().zip}>
                  <div class="form-error">{errors().zip}</div>
                </Show>
              </div>
            </div>
          </div>

          {/* Step 3: Shipping Method */}
          <div class="card card-padded checkout-section">
            <div class="section-title">
              <span class="section-num">3</span> Shipping Method
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <label
                class="radio-row"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="shipping"
                  value="standard"
                  checked={shippingMethod() === "standard"}
                  onChange={(e) => setShippingMethod(e.target.value)}
                  style={{ marginTop: "2px", flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>Standard Shipping</div>
                  <div class="text-muted text-sm">
                    Free · Delivery estimate: 1–2 days
                  </div>
                </div>
                <div style={{ fontWeight: 700, flexShrink: 0 }}>
                  {shippingCost() === 0 ? " " : fmt(shippingCost())}
                </div>
              </label>
            </div>
          </div>

          {/* Step 4: Payment */}
          <div class="card card-padded checkout-section">
            <div class="section-title">
              <span class="section-num">4</span> Payment Method
            </div>

            <Show when={cardsData.loading}>
              <div class="loading-center" style={{ padding: "20px" }}>
                <div class="spinner" /> Loading cards…
              </div>
            </Show>

            <div class="saved-cards-list">
              <For each={savedCards()}>
                {(card) => (
                  <div
                    class={`saved-card-row ${cardId() === card.id ? "selected" : ""}`}
                    onClick={() => setCardId(card.id)}
                  >
                    <div class="card-radio">
                      <div
                        class={`radio-dot ${cardId() === card.id ? "active" : ""}`}
                      />
                    </div>
                    <div class="card-brand-icon">
                      {cardBrandEmoji(card.brand)}
                    </div>
                    <div class="card-details">
                      <div class="card-num">
                        {card.brand} •••• {card.last4}
                      </div>
                      <div class="text-muted text-xs">
                        Expires {card.exp}
                        {card.is_default ? " · Default" : ""}
                      </div>
                    </div>
                    <Show when={card.is_default}>
                      <span class="badge badge-accent">Default</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <Show when={errors().card}>
              <div class="form-error">{errors().card}</div>
            </Show>

            <button class="add-card-trigger" onClick={() => setShowModal(true)}>
              <span>+</span> Add New Card
            </button>
          </div>

          {/* Step 5: Wallet */}
          <div class="card card-padded checkout-section">
            <div class="section-title">
              <span class="section-num">5</span> Wallet Credit
            </div>
            <div class="wallet-credit-container">
              {/* Checkbox + Label */}
              <label class="wallet-credit-checkbox-label">
                <input
                  type="checkbox"
                  checked={applyWallet()}
                  onChange={(e) => setApplyWallet(e.target.checked)}
                  class="wallet-checkbox"
                />
                <span class="wallet-checkbox-text">Apply wallet credit</span>
              </label>

              {/* Available Balance */}
              <div class="wallet-available">
                <span class="wallet-available-label">Available:</span>
                <span class="wallet-available-amount">
                  {fmt(walletBalance())}
                </span>
              </div>

              {/* Slider + Min/Max Labels */}
              <Show when={applyWallet()}>
                <div class="wallet-slider-section">
                  <div class="wallet-slider-row">
                    <span class="wallet-min-label">$0</span>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, Math.min(walletBalance(), subtotal()))}
                      value={walletAmount() || 0}
                      onInput={(e) => {
                        const v = parseFloat(e.target.value || "0") || 0;
                        setWalletAmount(v);
                      }}
                      class="wallet-slider"
                    />
                    <span class="wallet-max-label">
                      {fmt(Math.max(0, Math.min(walletBalance(), subtotal())))}
                    </span>
                  </div>

                  {/* Deducted Amount */}
                  <div class="wallet-deduct-row">
                    <span class="wallet-deduct-label">Applying:</span>
                    <span class="wallet-deduct-amount">
                      {fmt(walletDisc())}
                    </span>
                  </div>
                </div>
              </Show>
            </div>
          </div>

          {/* Protection Plans */}
          <div class="card card-padded checkout-section">
            <div class="section-title">
              <span class="section-num">6</span> Protection Plans
            </div>
            <div class="protection-plans-list">
              <For each={cartStore.items}>
                {(item) => (
                  <div class="protection-plan-item">
                    {/* Line 1: Device name + Price */}
                    <div class="protection-plan-header">
                      <div class="protection-plan-name">{item.title}</div>
                      <div class="protection-plan-price">
                        {item.protection_plan
                          ? `${fmt(item.protection_plan.price)} / mo`
                          : fmt(12.99) + " / mo"}
                      </div>
                    </div>

                    {/* Line 2: Action button */}
                    <div class="protection-plan-actions">
                      <Show when={item.protection_plan}>
                        <button
                          class="btn btn-link"
                          onClick={() => removeProtectionFromItem(item._key)}
                        >
                          ✕ Remove protection
                        </button>
                      </Show>

                      <Show when={!item.protection_plan}>
                        <button
                          class="btn btn-outline"
                          onClick={() => addProtectionToItem(item._key)}
                        >
                          + Add protection
                        </button>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Order Summary ─────────────────────────────── */}
        <div class="order-summary-panel">
          <div class="order-summary-card card card-padded">
            <h3 class="order-summary-title">Order Summary</h3>

            <div class="summary-items">
              <For each={cartStore.items}>
                {(item) => (
                  <div class="summary-item">
                    <div class="summary-item-emoji">{productEmoji(item)}</div>
                    <div class="summary-item-info">
                      <div class="summary-item-name">{item.title}</div>
                      <Show when={item.protection_plan}>
                        <div class="text-xs" style={{ color: "var(--accent)" }}>
                          + 🛡 Protection Plan
                        </div>
                      </Show>
                      <div class="text-muted text-xs">Qty: {item.qty}</div>
                    </div>
                    <div class="summary-item-price font-mono">
                      {fmt(
                        item.price * item.qty +
                          (item.protection_plan
                            ? item.protection_plan.price * item.qty
                            : 0),
                      )}
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div class="divider" style={{ margin: "16px 0" }} />

            <div class="summary-financials">
              <div class="summary-fin-row">
                <span class="text-muted">Subtotal</span>
                <span class="font-mono">{fmt(subtotal())}</span>
              </div>
              <Show when={walletDisc() > 0}>
                <div class="summary-fin-row text-success">
                  <span>◈ Wallet Credit</span>
                  <span class="font-mono">−{fmt(walletDisc())}</span>
                </div>
              </Show>
              <div class="summary-fin-row text-muted">
                <span>
                  Tax ({(taxRateValue() * 100).toFixed(1)}% · {state()})
                </span>
                <span class="font-mono">{fmt(taxAmount())}</span>
              </div>
              <div class="summary-fin-row text-muted">
                <span>Shipping</span>
                <span class="font-mono">
                  {shippingCost() === 0 ? "Free" : fmt(shippingCost())}
                </span>
              </div>
              <div class="divider" style={{ margin: "12px 0" }} />
              <div class="summary-fin-row summary-total">
                <span>Total</span>
                <span class="font-mono text-accent2">{fmt(total())}</span>
              </div>
            </div>

            <button
              class="btn btn-primary btn-lg w-full"
              style={{ "margin-top": "20px" }}
              disabled={placing() || cartStore.items.length === 0}
              onClick={handlePlaceOrder}
            >
              {placing() ? (
                <>
                  <div
                    class="spinner"
                    style={{
                      width: "16px",
                      height: "16px",
                      "border-width": "2px",
                    }}
                  />{" "}
                  Processing…
                </>
              ) : (
                "→ Place Order"
              )}
            </button>

            <p class="secure-note">🔒 Secured by 256-bit TLS encryption</p>
          </div>
        </div>
      </div>

      {/* New Card Modal */}
      <Show when={showModal()}>
        <NewCardModal
          onClose={() => setShowModal(false)}
          onAdded={(card) => {
            refetchCards();
            setCardId(card.id);
            setShowModal(false);
          }}
        />
      </Show>
    </div>
  );
}
