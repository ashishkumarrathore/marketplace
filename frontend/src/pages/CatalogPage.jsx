import {
  createSignal,
  createResource,
  For,
  Show,
  createEffect,
  onMount,
} from "solid-js";
import {
  fetchProducts,
  fetchEligibleCatalog,
  fetchAccount,
  fetchProfile,
} from "../api/client";
import { addToCart, navigate, showToast, setSelectedProduct } from "../store";
import { productEmoji, fmt } from "../utils";
import "./CatalogPage.css";
import deviceImages from "/public/data/device_images.json";

export default function CatalogPage() {
  const [search, setSearch] = createSignal("");
  const [filterType, setFilterType] = createSignal("");
  const [filterBrand, setFilterBrand] = createSignal("");
  const [page, setPage] = createSignal(1);
  const PAGE_SIZE = 24;

  // createResource re-fetches whenever query params change
  const [data, { refetch }] = createResource(
    () => ({
      q: search(),
      type: filterType(),
      brand: filterBrand(),
      page: page(),
      page_size: PAGE_SIZE,
    }),
    (params) => fetchProducts(params),
  );

  // eligible catalog mapping (platform_id list) used to filter items
  const [eligible, { refetch: refetchEligible }] = createResource(
    () => true,
    async () => {
      try {
        const resp = await fetchEligibleCatalog();
        if (!resp || !Array.isArray(resp)) return [];
        return resp
          .map((r) => r.platform_id || r.platform_id?.toString() || "")
          .filter(Boolean);
      } catch (err) {
        return [];
      }
    },
  );

  // Refresh eligible mapping on mount so changes to the backend file are picked up
  onMount(() => {
    // if user is logged in, refresh profile and account to prefill UI
    (async () => {
      try {
        // 1. Fetch profile (user info)
        const prof = await fetchProfile();
        if (prof && prof.user) {
          try {
            sessionStorage.setItem("marketone_profile", JSON.stringify(prof));
          } catch (e) {}
        }
      } catch (e) {
        // ignore profile fetch failures
      }

      try {
        // 2. Fetch account (wallet, shipping, payment methods)
        const acct = await fetchAccount();
        if (acct) {
          try {
            sessionStorage.setItem("marketone_account", JSON.stringify(acct));
          } catch (e) {}
        }
      } catch (e) {
        // ignore account fetch failures
      }

      try {
        // 4. Fetch eligible catalog (product filtering mapping)
        refetchEligible();
      } catch (e) {
        // ignore
      }
    })();
  });

  // Debug: print loaded catalog data to browser console for verification
  createEffect(() => {
    if (data()) {
      // eslint-disable-next-line no-console
      console.log("CATALOG PAGE: loaded data", data());
    }
  });

  const products = () => {
    const items = data()?.items || [];
    const raw = eligible() || [];
    const allowed = new Set(raw.map((r) => normalizeId(r)));
    // if eligible list empty, don't filter
    if (!allowed.size) return items;
    return items.filter((it) => allowed.has(normalizeId(it.platform_id)));
  };
  const brands = () => data()?.brands || [];
  const types = () => data()?.types || [];
  const totalPg = () => data()?.total_pages || 1;
  const total = () => data()?.total || 0;

  // parse platform_id like 'iphone_17_pro_256gb_cosmic_black' -> {base, storage, color}
  const parsePlatform = (pid) => {
    if (!pid) return { base: pid, storage: null, color: null };
    const toks = pid.split("_");
    let storage = null,
      color = null,
      base = pid;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const m = t.match(/(\d+(?:gb|tb))/i);
      if (m) {
        storage = m[1].toUpperCase();
        if (i + 1 < toks.length) color = toks[i + 1];
        base = toks.slice(0, i).join(" ");
        break;
      }
    }
    if (!storage && toks.length > 1) {
      color = toks[toks.length - 1];
      base = toks.slice(0, toks.length - 1).join(" ");
    }
    if (color)
      color = color
        .replace(/[-_]/g, " ")
        .replace(/\b([a-z])/g, (s) => s.toUpperCase());
    return { base: base.replace(/_/g, " "), storage, color };
  };

  // simple color name -> hex mapping for swatches
  const colorToHex = (color) => {
    if (!color) return "#bbb";
    const map = {
      black: "#111111",
      white: "#ffffff",
      silver: "#cfcfcf",
      gold: "#e6c200",
      blue: "#2563eb",
      red: "#ef4444",
      green: "#10b981",
      purple: "#7c3aed",
      pink: "#f472b6",
      gray: "#6b7280",
      "midnight blue": "#0f172a",
      "cosmic orange": "#ef871e",
      "arctic silver": "#cfd8dc",
      "rose gold": "#f6d0c4",
    };
    const key = color.toLowerCase().trim();
    return map[key] || "#bbb";
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

  let searchTimer;
  const handleSearch = (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setSearch(e.target.value);
      setPage(1);
    }, 350);
  };

  const handleAddToCart = (e, p) => {
    e.stopPropagation();
    const titleText =
      p.display_title && p.display_title.length > 0
        ? p.display_title
        : typeof p.title === "string"
          ? p.title
          : (p.title && (p.title.en_US || Object.values(p.title || {})[0])) ||
            "";
    addToCart(p);
    showToast(`✓ ${String(titleText).slice(0, 32)}… added`);
  };

  return (
    <div class="page-wrapper">
      {/* Header */}
      <div class="page-header">
        <h1 class="page-title">◈Marketplace </h1>
        <p class="page-subtitle">
          {data.loading
            ? "Loading…"
            : data() && data().cards && data().cards.length > 0
              ? `${data().cards.length} collections`
              : `${total()} products available`}
        </p>
      </div>

      {/* Filters bar */}
      <div class="filters-bar">
        <input
          class="input-field search-input"
          type="text"
          placeholder="🔍  Search devices & accessories…"
          onInput={handleSearch}
        />

        <select
          class="select-field brand-select"
          onChange={(e) => {
            setFilterBrand(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Brands</option>
          <For each={brands()}>{(b) => <option value={b}>{b}</option>}</For>
        </select>

        <div class="type-chips">
          {[
            ["", "All"],
            ["device", "Devices"],
            ["accessory", "Accessories"],
          ].map(([val, label]) => (
            <button
              class={`type-chip ${filterType() === val ? "active" : ""}`}
              onClick={() => {
                setFilterType(val);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      <Show when={data.loading}>
        <div class="loading-center">
          <div class="spinner" />
          <span>Loading products…</span>
        </div>
      </Show>

      {/* Error */}
      <Show when={data.error}>
        <div class="loading-center" style={{ color: "var(--danger)" }}>
          ⚠ Could not load catalog — {data.error?.message}
        </div>
      </Show>

      {/* Product grid (primary) */}
      <Show when={!data.loading && products().length > 0}>
        <div class="product-grid">
          <For each={products()}>
            {(p) => {
              // helper to safely read subtitle/brand
              const brandRaw =
                typeof p.subtitle === "string"
                  ? p.subtitle
                  : (p.subtitle &&
                      (p.subtitle.en_US ||
                        p.subtitle[Object.keys(p.subtitle)[0]])) ||
                    "";
              const brand = (brandRaw || "").toLowerCase();

              const brandFallback = (b) => {
                if (!b) return "";
                if (b.includes("apple")) return "/images/iphone-hero.jpg";
                if (b.includes("samsung")) return "/images/samsung-hero.jpg";
                if (b.includes("google") || b.includes("pixel"))
                  return "/images/pixel-hero.jpg";
                return "";
              };

              // Prefer real product images, but ignore placeholder/example CDN URLs
              let rawImg = "";
              if (typeof p.hero_image === "string" && p.hero_image)
                rawImg = p.hero_image;
              else if (typeof p.image === "string" && p.image) rawImg = p.image;
              else if (p.heroImage && typeof p.heroImage === "string")
                rawImg = p.heroImage;
              else if (
                p.pictures &&
                p.pictures.en_US &&
                p.pictures.en_US[0] &&
                p.pictures.en_US[0].url
              )
                rawImg = p.pictures.en_US[0].url;

              if (rawImg && rawImg.includes("cdn.example.com")) rawImg = "";

              let mappedImg = "";
              try {
                const titleText = (p.title && (p.title.en_US || p.title)) || "";
                const match = deviceImages.find((d) =>
                  titleText.toLowerCase().includes(d.name.toLowerCase()),
                );
                if (match) mappedImg = match.image_url;
              } catch (err) {
                mappedImg = "";
              }

              const img = rawImg || mappedImg || brandFallback(brand) || "";

              // prefer backend-provided fields
              const variantLabel =
                p.storage || p.color
                  ? [p.storage, p.color].filter(Boolean).join(" • ")
                  : (() => {
                      const pid = p.platform_id || p.id || "";
                      const parsed = parsePlatform(pid);
                      return [parsed.storage, parsed.color]
                        .filter(Boolean)
                        .join(" • ");
                    })();

              const displayTitle =
                p.display_title && p.display_title.length > 0
                  ? p.display_title
                  : (
                      p.title?.en_US ||
                      p.title ||
                      p.platform_id ||
                      ""
                    ).toString();

              return (
                <div
                  class="product-card card card-hover"
                  onClick={() => {
                    setSelectedProduct(p);
                    navigate("detail", p);
                  }}
                >
                  {/* Image area - clicking image navigates to detail */}
                  <div
                    class="product-card-img"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProduct(p);
                      navigate("detail", p);
                    }}
                    style={{ cursor: img ? "pointer" : "default" }}
                  >
                    <Show
                      when={img}
                      fallback={
                        <span class="product-emoji">{productEmoji(p)}</span>
                      }
                    >
                      <img
                        class="product-image"
                        src={img}
                        alt={
                          p.title?.en_US ||
                          p.title ||
                          p.platform_id ||
                          "product"
                        }
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        style={{
                          "max-width": "90%",
                          "max-height": "90%",
                          "object-fit": "contain",
                        }}
                      />
                    </Show>
                  </div>

                  {/* Body */}
                  <div class="product-card-body">
                    <div
                      class="product-brand text-xs text-muted"
                      style={{
                        "text-transform": "uppercase",
                        "letter-spacing": "0.07em",
                        "font-weight": "600",
                      }}
                    >
                      {p.subtitle}
                    </div>
                    <div class="product-title">{displayTitle}</div>
                    {/* Hide storage/color and short description on catalog cards per request */}
                  </div>

                  {/* Footer */}
                  <div class="product-card-footer">
                    <span class="product-price font-mono">{fmt(p.price)}</span>
                    <button
                      class="btn btn-primary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCart(e, p);
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        style={{
                          marginRight: "6px",
                          verticalAlign: "middle",
                          color: "#fff",
                        }}
                        aria-hidden="true"
                      >
                        <path
                          d="M3 3h2l.4 2M7 13h10l4-8H5.4"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                        <circle cx="10" cy="20" r="1" fill="currentColor" />
                        <circle cx="18" cy="20" r="1" fill="currentColor" />
                      </svg>
                      Cart
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        {/* Pagination */}
        <div class="pagination">
          <button
            class="page-btn"
            disabled={page() <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹ Prev
          </button>
          <For
            each={Array.from({ length: Math.min(totalPg(), 7) }, (_, i) => {
              const half = 3;
              let start = Math.max(1, page() - half);
              let end = Math.min(totalPg(), start + 6);
              start = Math.max(1, end - 6);
              return start + i;
            })}
          >
            {(n) => (
              <button
                class={`page-btn ${n === page() ? "active" : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            )}
          </For>
          <button
            class="page-btn"
            disabled={page() >= totalPg()}
            onClick={() => setPage((p) => p + 1)}
          >
            Next ›
          </button>
        </div>
      </Show>

      {/* Empty */}
      <Show
        when={
          !data.loading &&
          (!data() || !data().cards || data().cards.length === 0) &&
          products().length === 0 &&
          !data.error
        }
      >
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">No products found</div>
          <div class="empty-subtitle">
            Try adjusting your search or filter settings.
          </div>
        </div>
      </Show>
    </div>
  );
}
