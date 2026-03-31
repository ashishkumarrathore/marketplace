"""
MarketOne — FastAPI REST Backend
=================================
Run: uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import json
import random
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MarketOne API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load catalog (split across 3 part files) ──────────────────
_BASE = Path(__file__).parent
ALL_PRODUCTS: list[dict] = []
for part_file in sorted(_BASE.glob("catalog_part*.json")):
    with part_file.open(encoding="utf-8") as _f:
        _data = json.load(_f)
        ALL_PRODUCTS.extend(
            p for p in _data.get("resources", []) if p.get("displayable", True)
        )

# Fallback: try monolithic catalog.json if parts not found
if not ALL_PRODUCTS:
    _mono = _BASE / "catalog.json"
    if _mono.exists():
        with _mono.open(encoding="utf-8") as _f:
            ALL_PRODUCTS = [
                p for p in json.load(_f).get("resources", []) if p.get("displayable", True)
            ]


def _price(p: dict) -> float:
    s = p.get("status", [])
    return float(s[0].get("amount", 0)) if isinstance(s, list) and s else 0.0


def _hero(p: dict) -> str:
    for pic in p.get("pictures", {}).get("en_US", []):
        if pic.get("type") == 4:
            return pic["url"]
    return ""


def _item(p: dict) -> dict:
    return {
        "id": p["id"],
        "platform_id": p["platform_id"],
        "title": p.get("title", {}).get("en_US", ""),
        "subtitle": p.get("subtitle", {}).get("en_US", ""),
        "description": p.get("description", {}).get("en_US", ""),
        "short_description": p.get("short_description", {}).get("en_US", ""),
        "price": _price(p),
        "currency": "USD",
        "product_type": p.get("product_type", "device"),
        "business_type": p.get("business_type", "Device"),
        "product_status": p.get("product_status", "activated"),
        "hero_image": _hero(p),
        "rights": p.get("rights", {}),
        "pictures": p.get("pictures", {}).get("en_US", []),
    }


# ── In-memory state ────────────────────────────────────────────
WALLET: dict = {
    "balance": 125.00,
    "currency": "USD",
    "grants": [
        {"id": "g1", "amount": 75.00, "reason": "Loyalty Reward Q1",
         "date": "2026-01-15", "expires": "2026-07-15"},
        {"id": "g2", "amount": 50.00, "reason": "Referral Bonus",
         "date": "2026-02-20", "expires": "2026-08-20"},
    ],
    "usage": [
        {"id": "u1", "amount": -30.00, "reason": "Order #ORD-2001", "date": "2026-03-01"},
        {"id": "u2", "amount": -20.00, "reason": "Order #ORD-2002", "date": "2026-03-10"},
    ],
    "upcoming_expirations": [
        {"amount": 75.00, "expires": "2026-07-15"},
        {"amount": 50.00, "expires": "2026-08-20"},
    ],
}

SAVED_CARDS: list[dict] = [
    {"id": "card_001", "brand": "Visa",       "last4": "4242", "exp": "12/28", "is_default": True},
    {"id": "card_002", "brand": "Mastercard", "last4": "5555", "exp": "09/27", "is_default": False},
]

ORDERS: dict[str, dict] = {
    "ORD-2001": {
        "id": "ORD-2001", "date": "2026-03-01", "status": "Delivered",
        "subtotal": 1299.00, "wallet_credit": -30.00, "tax": 68.85,
        "tax_rate": 0.053, "total": 1337.85,
        "card_last4": "4242", "card_brand": "Visa",
        "items": [{"id": "p1", "title": "iPhone 17 Pro 256GB Cosmic Black", "qty": 1, "price": 1299.00}],
        "shipping": {"name": "Alex Johnson", "street": "123 Main St",
                     "city": "Springfield", "state": "VA", "zip": "22150"},
        "email": "alex@example.com",
    },
    "ORD-2002": {
        "id": "ORD-2002", "date": "2026-03-10", "status": "Processing",
        "subtotal": 79.00, "wallet_credit": -20.00, "tax": 3.13,
        "tax_rate": 0.053, "total": 62.13,
        "card_last4": "5555", "card_brand": "Mastercard",
        "items": [{"id": "p5", "title": "MagSafe Charger 30W", "qty": 1, "price": 79.00}],
        "shipping": {"name": "Alex Johnson", "street": "456 Oak Ave",
                     "city": "Arlington", "state": "VA", "zip": "22201"},
        "email": "alex@example.com",
    },
}

STATE_TAX: dict[str, float] = {
    "VA": 0.053, "CA": 0.0725, "NY": 0.08, "TX": 0.0625,
    "FL": 0.06,  "WA": 0.065,  "OR": 0.00, "MT": 0.00,
    "NV": 0.0685, "AZ": 0.056,
}


def _tax(state: str) -> float:
    return STATE_TAX.get(state.upper().strip(), 0.08)


# ── Schemas ────────────────────────────────────────────────────
class ShippingAddress(BaseModel):
    name: str; street: str; city: str; state: str; zip: str

class CheckoutItem(BaseModel):
    id: str; title: str; price: float; qty: int = 1
    protection_plan: Optional[bool] = False

class CheckoutRequest(BaseModel):
    email: str
    shipping: ShippingAddress
    card_id: Optional[str] = None
    new_card: Optional[dict] = None
    items: list[CheckoutItem]
    use_wallet_credit: bool = True

class AddCardRequest(BaseModel):
    number: str; exp: str; cvv: str; name: str


# ── Endpoints ──────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "products_loaded": len(ALL_PRODUCTS)}


@app.get("/catalog")
def get_catalog(
    q: Optional[str] = None,
    type: Optional[str] = None,
    brand: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    page: int = 1,
    page_size: int = 24,
):
    items = [_item(p) for p in ALL_PRODUCTS]
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i["title"].lower()
                 or ql in i["subtitle"].lower() or ql in i["description"].lower()]
    if type:  items = [i for i in items if i["product_type"].lower() == type.lower()]
    if brand: items = [i for i in items if i["subtitle"].lower() == brand.lower()]
    if min_price is not None: items = [i for i in items if i["price"] >= min_price]
    if max_price is not None: items = [i for i in items if i["price"] <= max_price]

    total = len(items)
    total_pages = max(1, -(-total // page_size))
    start = (page - 1) * page_size
    all_for_filters = [_item(p) for p in ALL_PRODUCTS]

    return {
        "page": page, "page_size": page_size, "total": total,
        "total_pages": total_pages,
        "brands": sorted({i["subtitle"] for i in all_for_filters if i["subtitle"]}),
        "types":  sorted({i["product_type"] for i in all_for_filters}),
        "items":  items[start: start + page_size],
    }


@app.get("/catalog/{product_id}")
def get_product(product_id: str):
    for p in ALL_PRODUCTS:
        if p["id"] == product_id or p["platform_id"] == product_id:
            return _item(p)
    raise HTTPException(404, "Product not found")


@app.get("/wallet")
def get_wallet():
    return WALLET


@app.get("/wallet/cards")
def get_cards():
    return {"cards": SAVED_CARDS}


@app.post("/wallet/cards")
def add_card(req: AddCardRequest):
    num = req.number.replace(" ", "").replace("-", "")
    if len(num) < 13:
        raise HTTPException(400, "Invalid card number")
    last4 = num[-4:]
    brand = ("Visa" if num.startswith("4") else
             "Mastercard" if num.startswith("5") else
             "Amex" if num.startswith("3") else "Card")
    card = {"id": f"card_{random.randint(1000,9999)}", "brand": brand,
            "last4": last4, "exp": req.exp, "is_default": False}
    SAVED_CARDS.append(card)
    return {"card": card, "message": "Card added successfully"}


@app.get("/orders")
def get_orders():
    summary = [
        {"id": o["id"], "date": o["date"], "status": o["status"],
         "total": o["total"], "item_count": len(o["items"]),
         "first_item": o["items"][0]["title"] if o["items"] else ""}
        for o in ORDERS.values()
    ]
    return {"orders": sorted(summary, key=lambda x: x["date"], reverse=True)}


@app.get("/orders/{order_id}")
def get_order(order_id: str):
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return {**order, "card_last4": "••••" + order["card_last4"]}


@app.post("/checkout")
def checkout(req: CheckoutRequest):
    if req.card_id:
        card = next((c for c in SAVED_CARDS if c["id"] == req.card_id), None)
        if not card:
            raise HTTPException(400, f"Card '{req.card_id}' not found")
        brand, last4 = card["brand"], card["last4"]
    elif req.new_card:
        num = str(req.new_card.get("number", "")).replace(" ", "")
        last4 = num[-4:] if len(num) >= 4 else "0000"
        brand = "Visa" if num.startswith("4") else "Mastercard" if num.startswith("5") else "Card"
        SAVED_CARDS.append({"id": f"card_{random.randint(1000,9999)}", "brand": brand,
                             "last4": last4, "exp": req.new_card.get("exp", ""), "is_default": False})
    else:
        raise HTTPException(400, "No payment method provided")

    subtotal = sum(
        i.price * i.qty + (12.99 if i.protection_plan else 0) for i in req.items
    )
    tax_rate = _tax(req.shipping.state)
    tax = round(subtotal * tax_rate, 2)
    wallet_credit = 0.0
    if req.use_wallet_credit and WALLET["balance"] > 0:
        wallet_credit = -round(min(WALLET["balance"], subtotal + tax), 2)
        WALLET["balance"] = round(WALLET["balance"] + wallet_credit, 2)
    total = round(subtotal + tax + wallet_credit, 2)

    order_id = f"ORD-{random.randint(3000,9999)}"
    order = {
        "id": order_id, "date": datetime.now().strftime("%Y-%m-%d"),
        "status": "Confirmed", "subtotal": subtotal,
        "wallet_credit": wallet_credit, "tax": tax, "tax_rate": tax_rate,
        "total": total, "card_last4": last4, "card_brand": brand,
        "items": [i.dict() for i in req.items],
        "shipping": req.shipping.dict(), "email": req.email,
    }
    ORDERS[order_id] = order
    if wallet_credit < 0:
        WALLET["usage"].append({
            "id": f"u{len(WALLET['usage'])+1}", "amount": wallet_credit,
            "reason": f"Order #{order_id}", "date": order["date"],
        })
    return order
