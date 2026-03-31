import {
  createSignal,
  Show,
  createEffect,
  For,
  createResource,
  onMount,
} from "solid-js";
import {
  selectedProduct,
  setSelectedProduct,
  addToCart,
  navigate,
  showToast,
} from "../store";
import {
  fetchProduct,
  fetchProducts,
  fetchEligibleCatalog,
} from "../api/client";
import { productEmoji, fmt } from "../utils";
import "./DetailPage.css";

const PROTECTION_BENEFITS = [
  "Accidental damage coverage (drops, spills)",
  "Theft & loss protection",
  "Battery health guarantee (>80%)",
  "Same-day express replacement",
  "24/7 priority tech support",
  "No deductible for first claim",
];

export default function DetailPage() {
  const p = selectedProduct;

  // Variant selection state
  const [selectedVariant, setSelectedVariant] = createSignal(null);

  // protection plan state
  const [planEnabled, setPlanEnabled] = createSignal(false);
  const [consentGiven, setConsentGiven] = createSignal(false);
  const [consentError, setConsentError] = createSignal(false);

  // hovered color for tooltip-like fixed label
  const [hoveredColor, setHoveredColor] = createSignal(null);
  const [colorLabelPos, setColorLabelPos] = createSignal({ x: 0, y: 0 });

  // update selected variant when product changes
  createEffect(() => {
    const prod = p();
    if (!prod) {
      setSelectedVariant(null);
      return;
    }
    if (prod.variants && prod.variants.length > 0) {
      // Preserve prior selection if possible:
      const current = selectedVariant();
      let pick = null;
      if (current && current.platform_id) {
        pick = prod.variants.find(
          (v) =>
            normalizeId(v.platform_id) === normalizeId(current.platform_id),
        );
      }
      // If no match, prefer the product's own platform_id (when user clicked a specific variant on Catalog page)
      if (!pick && prod.platform_id) {
        pick = prod.variants.find(
          (v) => normalizeId(v.platform_id) === normalizeId(prod.platform_id),
        );
      }
      // Fallback to first available variant
      if (!pick) pick = prod.variants[0];
      setSelectedVariant(pick);
    } else {
      // fallback: construct a lightweight variant from product summary
      setSelectedVariant({
        id: prod.id,
        platform_id: prod.platform_id,
        title: prod.title,
        price: prod.price,
        hero_image: prod.hero_image,
        storage: prod.storage,
        color: prod.color,
      });
    }
  });

  // Ensure we fetch group variants once to avoid repeated requests
  const _fetchedGroups = new Set();
  // eligible list (productId values) used to filter variants
  const [eligibleList, { refetch: refetchEligibleList }] = createResource(
    () => true,
    async () => {
      try {
        const resp = await fetchEligibleCatalog();
        if (!resp || !Array.isArray(resp)) return [];
        return resp
          .map((r) => r.productId || (r.productId && r.productId.toString()))
          .filter(Boolean);
      } catch (err) {
        return [];
      }
    },
  );

  // ensure eligible list is fresh when this page mounts
  onMount(() => {
    try {
      refetchEligibleList();
    } catch (e) {
      /* ignore */
    }
  });

  createEffect(async () => {
    const prod = p();
    if (!prod || !prod.platform_id) {
      console.log("[DetailPage] No product or platform_id");
      return;
    }

    // Extract product group from platform_id (e.g., "iphone_17_pro" from "iphone_17_pro_256gb_cosmic_black")
    const getProductGroup = (platformId) => {
      if (!platformId) return "";
      const id = platformId.toLowerCase();
      if (id.includes("iphone_17_pro_max")) return "iphone_17_pro_max";
      if (id.includes("iphone_17_pro")) return "iphone_17_pro";
      if (id.includes("iphone_17")) return "iphone_17";
      return "";
    };

    const productGroup = getProductGroup(prod.platform_id);
    console.log(
      "[DetailPage] Product group:",
      productGroup,
      "Platform ID:",
      prod.platform_id,
    );
    if (!productGroup) {
      console.log("[DetailPage] No product group determined");
      return;
    }

    // Only fetch once per product group
    if (_fetchedGroups.has(productGroup)) {
      console.log(
        "[DetailPage] Already fetched variants for group:",
        productGroup,
      );
      return;
    }
    _fetchedGroups.add(productGroup);

    console.log(
      "[DetailPage] Fetching variants for product group:",
      productGroup,
    );
    try {
      // Use product_groups filter parameter in /api/products API
      const resp = await fetchProducts({
        page_size: 500,
        product_groups: productGroup,
      });
      console.log(
        "[DetailPage] Got products response with product_groups filter, items count:",
        resp?.items?.length,
      );

      let variants = resp?.items || [];

      // Don't apply eligible list filter when using product_groups
      // (the backend already filtered by product_groups, and eligible list may be empty)
      // Only apply eligible filter if we have one AND it's not a product_groups query
      // const allowed = new Set(eligibleList() || []);
      // if (allowed.size) {
      //   console.log(
      //     "[DetailPage] Filtering by eligible list, allowed count:",
      //     allowed.size,
      //   );
      //   variants = variants.filter((v) => allowed.has(v.platform_id));
      // }

      console.log(
        "[DetailPage] Variants after filtering:",
        variants.length,
        "IDs:",
        variants.map((v) => v.platform_id).slice(0, 5),
      );

      // Set product with all variants grouped by product_group
      if (variants && variants.length > 0) {
        console.log(
          "[DetailPage] Setting product with",
          variants.length,
          "variants from product_groups filter",
        );
        setSelectedProduct({ ...prod, variants });
      } else {
        console.log(
          "[DetailPage] No variants found for product_group:",
          productGroup,
        );
      }
    } catch (err) {
      console.error(
        "[DetailPage] Failed to fetch variants by product_group:",
        err,
      );
    }
  });

  const handleToggle = () => {
    setPlanEnabled((v) => !v);
    if (planEnabled()) setConsentGiven(false);
    setConsentError(false);
  };

  // Handle color button hover for fixed-position label
  const handleColorHover = (event, colorName) => {
    if (!event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setColorLabelPos({
      x: rect.left + rect.width / 2 - 40, // Center the label above button
      y: rect.top - 44, // Position above with small gap
    });
    setHoveredColor(colorName);
  };

  const handleColorLeave = () => {
    setHoveredColor(null);
  };

  const handleAddToCart = () => {
    if (planEnabled() && !consentGiven()) {
      setConsentError(true);
      return;
    }
    const toAdd = selectedVariant() || p();
    addToCart(toAdd, planEnabled() ? { price: 12.99 } : null);
    showToast(
      `✓ ${(selectedVariant()?.title || p().title).slice(0, 36)}… added to cart`,
    );
    navigate("catalog");
  };

  // color swatch helper
  const colorSwatch = (color) => {
    if (!color) return "#bbb";
    const s = color.toString().toLowerCase();
    if (s.includes("black")) return "#0b0b0d";
    if (s.includes("midnight")) return "#0f172a";
    if (s.includes("cosmic")) return "#0b0b0d";
    if (s.includes("arctic") || s.includes("silver")) return "#cfd8dc";
    if (s.includes("rose")) return "#f6d0c4";
    if (s.includes("gold")) return "#e6c200";
    if (s.includes("blue")) return "#2563eb";
    if (s.includes("red")) return "#ef4444";
    if (s.includes("pink")) return "#f472b6";
    if (s.includes("green")) return "#10b981";
    if (s.includes("purple")) return "#7c3aed";
    if (s.includes("white")) return "#ffffff";
    if (s.includes("gray") || s.includes("grey")) return "#6b7280";
    // fallback: generate deterministic color from string
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const r = (hash >> 0) & 0xff;
    const g = (hash >> 8) & 0xff;
    const b = (hash >> 16) & 0xff;
    return `rgb(${(r + 256) % 256}, ${(g + 256) % 256}, ${(b + 256) % 256})`;
  };

  // normalize ids for comparison (remove separators, lowercase)
  const normalizeId = (id) => {
    if (!id) return "";
    return id
      .toString()
      .toLowerCase()
      .replace(/[_\-\s]+/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  return (
    <div class="page-wrapper">
      <button class="back-btn" onClick={() => navigate("catalog")}>
        ← Back to Catalog
      </button>

      <Show
        when={p()}
        fallback={<div class="loading-center">No product selected.</div>}
      >
        <div class="detail-grid">
          {/* Image panel */}
          <div class="detail-image-panel">
            <div class="detail-img-wrap">
              <Show
                when={selectedVariant() && selectedVariant().hero_image}
                fallback={<span class="detail-emoji">{productEmoji(p())}</span>}
              >
                <img
                  class="detail-img"
                  src={selectedVariant().hero_image}
                  alt={selectedVariant()?.title || p().title}
                  style={{
                    "max-width": "90%",
                    "max-height": "90%",
                    "object-fit": "contain",
                  }}
                />
              </Show>
              <div class="detail-img-glow" />
            </div>
            <div class="detail-meta-pills">
              <span class="badge badge-muted">{p().business_type}</span>
              <span class="badge badge-accent">{p().product_status}</span>
            </div>
          </div>

          {/* Info panel */}
          <div class="detail-info-panel">
            <div class="detail-brand">{p().subtitle}</div>
            <h1 class="detail-title">
              {selectedVariant()?.title || p().title}
            </h1>
            <div class="detail-price font-mono">
              {fmt(selectedVariant()?.price ?? p().price)}
            </div>
            <p class="detail-desc">{p().description}</p>

            {/* Variants: storage & color */}
            <Show when={p().variants && p().variants.length > 0}>
              <div class="variant-section">
                <div class="variant-label">Storage</div>
                <div class="variant-options">
                  <For
                    each={[
                      ...new Set(
                        p()
                          .variants.map((v) => v.storage)
                          .filter(Boolean),
                      ),
                    ]}
                  >
                    {(s) => {
                      const curColor = selectedVariant()?.color;
                      // Check if this storage has ANY available combination
                      const hasAnyCombo = p().variants.some(
                        (v) => v.storage === s,
                      );
                      // Check if this storage + current color combo exists
                      const hasComboWithColor = p().variants.some(
                        (v) =>
                          v.storage === s &&
                          (!curColor || v.color === curColor),
                      );
                      return (
                        <button
                          class={`variant-btn ${selectedVariant()?.storage === s ? "active" : ""} ${!hasAnyCombo ? "disabled" : ""}`}
                          disabled={!hasAnyCombo}
                          onClick={() => {
                            if (!hasAnyCombo) return;
                            // Try to match current color with this storage
                            const match = p().variants.find(
                              (v) =>
                                v.storage === s &&
                                v.color === selectedVariant()?.color,
                            );
                            // If color combo not available, pick first available for this storage
                            setSelectedVariant(
                              match ||
                                p().variants.find((v) => v.storage === s) ||
                                selectedVariant(),
                            );
                          }}
                          title={`${s} storage`}
                        >
                          {s}
                        </button>
                      );
                    }}
                  </For>
                </div>

                <div class="variant-label">Color</div>
                {/* Fixed-position color name label */}
                <Show when={hoveredColor()}>
                  <span
                    class="color-hover-label visible"
                    style={{
                      top: `${colorLabelPos().y}px`,
                      left: `${colorLabelPos().x}px`,
                    }}
                  >
                    {hoveredColor()}
                  </span>
                </Show>
                <div class="variant-options">
                  <For
                    each={[
                      ...new Set(
                        p()
                          .variants.map((v) => v.color)
                          .filter(Boolean),
                      ),
                    ]}
                  >
                    {(c) => {
                      const curStorage = selectedVariant()?.storage;
                      // Check if this color has ANY available combination
                      const hasAnyCombo = p().variants.some(
                        (v) => v.color === c,
                      );
                      // Check if this color + current storage combo exists
                      const hasComboWithStorage = p().variants.some(
                        (v) =>
                          v.color === c &&
                          (!curStorage || v.storage === curStorage),
                      );
                      return (
                        <button
                          class={`variant-btn color-btn ${selectedVariant()?.color === c ? "active" : ""} ${!hasAnyCombo ? "disabled" : ""}`}
                          disabled={!hasAnyCombo}
                          title={c}
                          onMouseEnter={(e) => handleColorHover(e, c)}
                          onMouseLeave={handleColorLeave}
                          onFocus={() => setHoveredColor(c)}
                          onBlur={() => setHoveredColor(null)}
                          onClick={() => {
                            if (!hasAnyCombo) return;
                            // Try to match current storage with this color
                            const match = p().variants.find(
                              (v) =>
                                v.color === c &&
                                v.storage === selectedVariant()?.storage,
                            );
                            // If storage combo not available, pick first available for this color
                            setSelectedVariant(
                              match ||
                                p().variants.find((v) => v.color === c) ||
                                selectedVariant(),
                            );
                          }}
                          aria-label={`Select color: ${c}`}
                        >
                          <span
                            class="swatch-fill"
                            style={{ background: colorSwatch(c) }}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* If no variants array, show single badges from product fields */}
            <Show when={!p().variants || p().variants.length === 0}>
              <div class="variant-section">
                <div class="variant-label">Storage</div>
                <div class="variant-options">
                  <div class="variant-badge">{p().storage || "—"}</div>
                </div>
                <div class="variant-label">Color</div>
                <div class="variant-options">
                  <div
                    class="variant-badge color-badge"
                    style={{
                      background: colorSwatch(p().color),
                      color:
                        colorSwatch(p().color) === "#fff" ||
                        colorSwatch(p().color) === "#ffffff" ||
                        colorSwatch(p().color) === "#cfd8dc"
                          ? "#222"
                          : "#fff",
                    }}
                  >
                    {p().color || "—"}
                  </div>
                </div>
              </div>
            </Show>

            {/* Protection card and summary */}
            <div class="protection-card">
              <div class="protection-header">
                <div class="protection-header-left">
                  <div class="protection-title">🛡️ Device Protection Plan</div>
                  <div class="protection-subtitle">
                    +$12.99/month · Cancel anytime
                  </div>
                </div>
                <label class="toggle" title="Enable protection plan">
                  <input
                    type="checkbox"
                    checked={planEnabled()}
                    onChange={handleToggle}
                  />
                  <span class="toggle-track" />
                  <span class="toggle-thumb" />
                </label>
              </div>

              <div
                class={`protection-benefits ${planEnabled() ? "enabled" : "dimmed"}`}
              >
                {PROTECTION_BENEFITS.map((b) => (
                  <div class="benefit-item">
                    <span class="benefit-dot" /> <span>{b}</span>
                  </div>
                ))}
              </div>

              <Show when={planEnabled()}>
                <div
                  class={`consent-box ${consentError() ? "consent-error" : ""}`}
                >
                  <label class="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={consentGiven()}
                      onChange={(e) => {
                        setConsentGiven(e.target.checked);
                        setConsentError(false);
                      }}
                    />
                    <span class="consent-text">
                      I have read and agree to the{" "}
                      <span class="consent-link">
                        Device Protection Plan Terms & Conditions
                      </span>
                      .
                    </span>
                  </label>
                  <Show when={consentError()}>
                    <div class="form-error" style={{ "margin-top": "8px" }}>
                      ⚠ You must accept the terms before adding the plan.
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            <div class="detail-total-line">
              <div>
                <div class="text-muted text-sm">Total today</div>
                <div class="detail-total-price font-mono">
                  {fmt(
                    (selectedVariant()?.price ?? p().price) +
                      (planEnabled() ? 12.99 : 0),
                  )}
                  <Show when={planEnabled()}>
                    <span
                      class="text-muted text-sm"
                      style={{ "font-family": "var(--font-body)" }}
                    >
                      {" "}
                      + $12.99/mo
                    </span>
                  </Show>
                </div>
              </div>
              <button class="btn btn-primary btn-lg" onClick={handleAddToCart}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  style={{
                    marginRight: "8px",
                    verticalAlign: "middle",
                    color: "#fff",
                  }}
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
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
