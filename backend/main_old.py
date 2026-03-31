from __future__ import annotations
import json, random, uuid, threading, tempfile, os
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# new store helper (Python version of the requested store.js)
import importlib, importlib.util
from pathlib import Path as _Path
try:
    # prefer package-style import when running as 'backend.main'
    from backend.data.store import (
        read_db, write_db, find_user_by_username, find_user_by_token,
        create_user, get_user_profile, save_order, update_user, find_account_by_user,
        delete_user, delete_account
    )
except Exception:
    # fallback: load the file directly by path (works when running module as script)
    _store_path = (_Path(__file__).parent / 'data' / 'store.py').resolve()
    spec = importlib.util.spec_from_file_location('data.store', str(_store_path))
    store_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(store_mod)
    read_db = store_mod.read_db
    write_db = store_mod.write_db
    find_user_by_username = store_mod.find_user_by_username
    find_user_by_token = store_mod.find_user_by_token
    create_user = store_mod.create_user
    get_user_profile = store_mod.get_user_profile
    save_order = store_mod.save_order
    update_user = store_mod.update_user
    find_account_by_user = store_mod.find_account_by_user
    delete_user = store_mod.delete_user
    delete_account = store_mod.delete_account

app = FastAPI(title="MarketOne API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_BASE = Path(__file__).parent
ALL_PRODUCTS: list[dict] = []
# Look for catalog files in /backend/data/ directory only (not parent)
DATA_DIR = Path(_BASE) / "data"
print(f"[STARTUP] Loading catalog from: {DATA_DIR}")
for _f in sorted(DATA_DIR.glob("catalog_part*.json")):
    print(f"[STARTUP] Loading: {_f}")
    json_data = json.load(_f.open(encoding="utf-8"))
    ALL_PRODUCTS.extend(p for p in json_data.get("resources", []) if p.get("displayable", True))
print(f"[STARTUP] Loaded {len(ALL_PRODUCTS)} products from catalog_part files")
if not ALL_PRODUCTS:
    _mono = DATA_DIR / "catalog.json"
    if _mono.exists():
        print(f"[STARTUP] Loading fallback: {_mono}")
        ALL_PRODUCTS = [p for p in json.load(_mono.open()).get("resources", []) if p.get("displayable", True)]

def _price(p):
    s = p.get("status", [])
    return float(s[0].get("amount", 0)) if isinstance(s, list) and s else 0.0

def _hero(p):
    for pic in p.get("pictures", {}).get("en_US", []):
        if pic.get("type") == 4: return pic["url"]
    return ""

def _parse_platform(pid):
    """
    Parse a platform_id into (group_base, storage, color).
    Handles underscores or hyphens and common storage tokens like '256gb', '1tb'.
    Returns group base normalized with spaces (e.g. 'iphone 17 pro'), storage like '256GB', and color like 'Cosmic Black'.
    """
    if not pid:
        return pid, "", ""
    import re
    s = str(pid).lower().replace('-', '_')
    parts = [p for p in s.split('_') if p]
    storage = ""
    color = ""
    base_parts = parts[:]
    storage_idx = None
    # find a storage token (e.g. '256gb', '1tb', '512gb')
    for i, p in enumerate(parts):
        if re.match(r'^\d+(gb|tb)$', p):
            storage_idx = i
            break
    if storage_idx is not None:
        storage_token = parts[storage_idx]
        m = re.match(r'^(\d+)(gb|tb)$', storage_token)
        storage = f"{m.group(1)}{m.group(2).upper()}" if m else storage_token.upper()
        color_parts = parts[storage_idx+1:]
        color = ' '.join([cp.capitalize() for cp in color_parts]) if color_parts else ""
        base_parts = parts[:storage_idx]
    else:
        # fallback: if there are at least 3 parts, assume last 2 are storage+color, or last part is color
        if len(parts) >= 3:
            possible_storage = parts[-2]
            if re.match(r'^\d+(gb|tb)$', possible_storage):
                m = re.match(r'^(\d+)(gb|tb)$', possible_storage)
                storage = f"{m.group(1)}{m.group(2).upper()}" if m else possible_storage.upper()
                color = ' '.join([p.capitalize() for p in parts[-1:]])
                base_parts = parts[:-2]
            else:
                # no clear storage token; treat last part as color
                color = ' '.join([p.capitalize() for p in parts[-1:]])
                base_parts = parts[:-1]
        else:
            base_parts = parts
    base = ' '.join([bp.replace('-', ' ').replace('_', ' ').strip() for bp in base_parts]).strip()
    if not base:
        base = pid
    return base, storage, color


def _item(p):
    # compute variant/display title for client convenience
    pid = p.get("platform_id") or p.get("id") or ""
    base, storage, color = _parse_platform(pid)
    title = p.get("title", {}).get("en_US", "") or p.get("title", "") or ""
    variant_parts = [s for s in (storage, color) if s]
    variant_label = " • ".join(variant_parts)
    display_title = f"{title}" if variant_label else title

    return {
        "id": p["id"], "platform_id": p.get("platform_id"),
        "title": title,
        "display_title": display_title,
        "subtitle": p.get("subtitle", {}).get("en_US", ""),
        "description": p.get("description", {}).get("en_US", ""),
        "short_description": p.get("short_description", {}).get("en_US", ""),
        "price": _price(p), "currency": "USD",
        "product_type": p.get("product_type", "device"),
        "business_type": p.get("business_type", "Device"),
        "product_status": p.get("product_status", "activated"),
        "hero_image": _hero(p), "rights": p.get("rights", {}),
        "pictures": p.get("pictures", {}).get("en_US", []),
        "storage": storage, "color": color,
        "product_group": base,
    }

WALLET = {
    "balance": 125.00, "currency": "USD",
    "grants": [
        {"id": "g1", "amount": 75.00, "reason": "Marketplace Protection Plan", "date": "2026-03-15", "expires": "2027-03-15"},
        {"id": "g2", "amount": 50.00, "reason": "New Member Welcome", "date": "2026-03-01", "expires": "2026-09-01"},
    ],
    "usage": [],
    "upcoming_expirations": [
        {"amount": 75.00, "expires": "2027-03-15"},
        {"amount": 50.00, "expires": "2026-09-01"},
    ],
}
SAVED_CARDS = [
    {"id": "card_001", "brand": "Visa", "last4": "4242", "exp": "12/28", "is_default": True},
    {"id": "card_002", "brand": "Mastercard", "last4": "5555", "exp": "09/27", "is_default": False},
]
ORDERS = {}
STATE_TAX = {"VA":0.053,"CA":0.0725,"NY":0.08,"TX":0.0625,"FL":0.06,"WA":0.065,"OR":0.0,"MT":0.0,"NV":0.0685,"AZ":0.056}

def _tax(state): return STATE_TAX.get(state.upper().strip(), 0.08)

class ShippingAddress(BaseModel):
    name: str; street: str; city: str; state: str; zip: str

class CheckoutItem(BaseModel):
    id: str; title: str; price: float; qty: int = 1; protection_plan: Optional[bool] = False

class CheckoutRequest(BaseModel):
    email: str; shipping: ShippingAddress
    card_id: Optional[str] = None; new_card: Optional[dict] = None
    items: list[CheckoutItem]; use_wallet_credit: bool = True
    wallet_amount_to_apply: Optional[float] = 0.0  # Amount of wallet credit to apply (from frontend selection)
    user_token: Optional[str] = None

class AddCardRequest(BaseModel):
    number: str; exp: str; cvv: str; name: str

# Serve frontend static files (if a built UI exists at ../frontend/public)
FRONTEND_DIR = (_BASE / '..' / 'frontend' / 'public').resolve()
if FRONTEND_DIR.exists():
    try:
        app.mount('/static', StaticFiles(directory=FRONTEND_DIR), name='static')
    except Exception:
        # mount may fail in some environments; ignore and continue
        pass

@app.get("/")
def read_index():
    index = FRONTEND_DIR / 'index.html'
    if index.exists():
        return FileResponse(index)
    raise HTTPException(404, 'UI not built; index.html not found')

@app.get("/health")
def health():
    return {"status": "ok", "products_loaded": len(ALL_PRODUCTS)}

@app.get("/catalog")
def get_catalog(q: Optional[str]=None, type: Optional[str]=None, brand: Optional[str]=None,
                min_price: Optional[float]=None, max_price: Optional[float]=None,
                page: int=1, page_size: int=24, product_groups: Optional[str]=None):
    items = [_item(p) for p in ALL_PRODUCTS]
    # if a specific product_group requested, normalize and filter
    if product_groups:
        key = product_groups.replace('_', ' ').strip().lower()
        items = [i for i in items if (i.get('product_group') or '').strip().lower() == key]

    if q:
        ql = q.lower()
        items = [i for i in items if ql in i["title"].lower() or ql in i["subtitle"].lower() or ql in i["description"].lower()]
    if type:  items = [i for i in items if i["product_type"].lower() == type.lower()]
    if brand: items = [i for i in items if i["subtitle"].lower() == brand.lower()]
    if min_price is not None: items = [i for i in items if i["price"] >= min_price]
    if max_price is not None: items = [i for i in items if i["price"] <= max_price]
    total = len(items)
    af = [_item(p) for p in ALL_PRODUCTS]
    # build groups summary
    groups = {}
    for it in af:
        g = (it.get('product_group') or '').strip()
        if not g: continue
        groups.setdefault(g, []).append(it)

    groups_list = [{"group": g, "count": len(v), "items": v} for g, v in sorted(groups.items(), key=lambda x: x[0])]

    return {
        "page": page, "page_size": page_size, "total": total,
        "total_pages": max(1, -(-total // page_size)),
        "brands": sorted({i["subtitle"] for i in af if i["subtitle"]}),
        "types": sorted({i["product_type"] for i in af}),
        "product_groups": sorted(list(groups.keys())),
        "groups": groups_list,
        "items": items[(page-1)*page_size : page*page_size],
    }

@app.get("/catalog/{product_id}")
def get_product(product_id: str):
    for p in ALL_PRODUCTS:
        if p["id"] == product_id or p["platform_id"] == product_id:
            return _item(p)
    raise HTTPException(404, "Product not found")

@app.get("/eligibleCatalog")
@app.get("/api/eligibleCatalog")
def get_eligible_catalog():
    """Return list of eligible products (all products for this demo)."""
    return [{"productId": p["id"], "platform_id": p.get("platform_id")} for p in ALL_PRODUCTS]

# ─────────────────────────────────────────────────────────────
# Authentication dependency - defined here so it's available for all endpoints below
# ─────────────────────────────────────────────────────────────
async def require_auth(request: Request):
    """Dependency that validates Authorization: Bearer <token> and returns the user dict.
    Attempts central store lookup first, then legacy users.json lookup and migration as fallback.
    """
    auth = request.headers.get('Authorization') or ''
    if not auth.startswith('Bearer '):
        raise HTTPException(401, 'Unauthorized')
    token = auth.split(' ', 1)[1].strip()

    user = None
    try:
        user = find_user_by_token(token)
    except Exception:
        user = None

    if not user:
        # attempt legacy lookup and migrate
        try:
            legacy = None
            if '_find_user_by_token' in globals():
                try:
                    legacy = _find_user_by_token(token)
                except Exception:
                    legacy = None
            if legacy:
                try:
                    _migrate_single_legacy_user(legacy)
                except Exception:
                    pass
                try:
                    user = find_user_by_token(token)
                except Exception:
                    user = None
        except Exception:
            user = None

    if not user:
        raise HTTPException(401, 'Unauthorized')

    request.state.user = user
    return user

@app.get("/wallet")
def get_wallet(user: dict = Depends(require_auth)):
    """Get authenticated user's wallet balance and transaction history"""
    # User has 'walletBalance' as a simple field, not nested 'wallet.balance'
    balance = user.get('walletBalance', 0)
    
    # Build usage list from user's orders (wallet credits applied)
    usage = []
    if user.get('accounts') and len(user['accounts']) > 0:
        for order in user['accounts'][0].get('orders', []):
            if order.get('wallet_credit') and order['wallet_credit'] < 0:
                usage.append({
                    "id": order.get('id'),
                    "amount": order['wallet_credit'],  # Negative value
                    "reason": f"Order {order.get('id')}",
                    "date": order.get('date', '')
                })
    
    # Sort by date, newest first
    usage = sorted(usage, key=lambda x: x.get('date', ''), reverse=True)
    
    # Fixed grants (placeholder for now - could be stored per user)
    grants = [
        {"id": "g1", "amount": 75.00, "reason": "Loyalty Reward Q1", "date": "2026-03-15", "expires": "2027-03-15"},
        {"id": "g2", "amount": 50.00, "reason": "New Member Welcome", "date": "2026-03-01", "expires": "2026-09-01"},
    ]
    
    # Combine all transactions
    history = grants + usage
    history = sorted(history, key=lambda x: x.get('date', ''), reverse=True)
    
    return {
        "balance": balance,
        "currency": "USD",
        "grants": grants,
        "usage": usage,
        "history": history,
        "upcoming_expirations": []
    }

@app.get("/wallet/cards")
def get_cards(): return {"cards": SAVED_CARDS}

@app.post("/wallet/cards")
def add_card(req: AddCardRequest):
    num = req.number.replace(" ", "").replace("-", "")
    if len(num) < 13: raise HTTPException(400, "Invalid card number")
    last4 = num[-4:]
    brand = "Visa" if num.startswith("4") else "Mastercard" if num.startswith("5") else "Amex" if num.startswith("3") else "Card"
    card = {"id": f"card_{random.randint(1000,9999)}", "brand": brand, "last4": last4, "exp": req.exp, "is_default": False}
    SAVED_CARDS.append(card)
    return {"card": card, "message": "Card added successfully"}

@app.get("/orders")
def get_orders(user: dict = Depends(require_auth)):
    """Get authenticated user's orders from their account"""
    # Get orders from user's first account
    user_orders = []
    if user.get('accounts') and len(user['accounts']) > 0:
        user_orders = user['accounts'][0].get('orders', [])
    
    # Format and sort by date
    rows = [{"id": o["id"], "date": o["date"], "status": o["status"], "total": o["total"],
             "item_count": len(o["items"]), "first_item": o["items"][0]["title"] if o["items"] else ""}
            for o in user_orders]
    return {"orders": sorted(rows, key=lambda x: x["date"], reverse=True)}

@app.get("/orders/{order_id}")
def get_order(order_id: str, user: dict = Depends(require_auth)):
    """Get a specific order for authenticated user"""
    # Search for order in user's account
    user_orders = []
    if user.get('accounts') and len(user['accounts']) > 0:
        user_orders = user['accounts'][0].get('orders', [])
    
    order = next((o for o in user_orders if o['id'] == order_id), None)
    if not order:
        raise HTTPException(404, "Order not found")
    
    return {**order, "card_last4": "••••" + order.get("card_last4", "")}

@app.post("/checkout")
def checkout(req: CheckoutRequest, user: dict = Depends(require_auth)):
    # determine card used
    if req.card_id:
        card = next((c for c in SAVED_CARDS if c["id"] == req.card_id), None)
        if not card: raise HTTPException(400, f"Card '{req.card_id}' not found")
        brand, last4 = card["brand"], card["last4"]
    elif req.new_card:
        num = str(req.new_card.get("number", "")).replace(" ", "")
        last4 = num[-4:] if len(num) >= 4 else ""
        brand = "Visa" if num.startswith("4") else ("Mastercard" if num.startswith("5") else ("Amex" if num.startswith("3") else "Card"))
    else:
        raise HTTPException(400, "No payment method provided")

    # compute totals
    subtotal = sum([(it.price * it.qty) for it in req.items])
    # include protection plan monthly charge as immediate charge (simplified)
    protection_total = sum([12.99 * (it.qty or 1) for it in req.items if it.protection_plan])
    subtotal += protection_total
    tax_rate = _tax(req.shipping.state)
    tax = round(subtotal * tax_rate, 2)

    # apply wallet credit if requested; amount taken equals amount specified by frontend or min(wallet balance, subtotal)
    wallet_used = 0.0
    if req.use_wallet_credit and user:
        # Get wallet balance from user - it's stored as 'walletBalance' (not nested 'wallet.balance')
        wb = float(user.get('walletBalance', 0))
        
        # Use the amount the frontend specified, or default to min(balance, subtotal) for backwards compatibility
        if req.wallet_amount_to_apply and req.wallet_amount_to_apply > 0:
            wallet_used = round(min(req.wallet_amount_to_apply, wb, subtotal), 2)
        else:
            wallet_used = round(min(wb, subtotal), 2)
        
        # deduct from user's wallet and persist change
        if wallet_used > 0:
            # Update user wallet balance and add to usage history
            try:
                new_balance = round(user.get('walletBalance', 0) - wallet_used, 2)
                update_user(str(user['id']), {'walletBalance': new_balance})
            except Exception:
                pass  # non-critical

    total = round(subtotal - wallet_used + tax, 2)

    # create order id and object
    order_id = f"ORD-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"
    order = {
        "id": order_id,
        "date": datetime.utcnow().isoformat(),
        "status": "Confirmed",
        "subtotal": subtotal,
        "wallet_credit": -wallet_used if wallet_used > 0 else 0,
        "tax": tax,
        "tax_rate": tax_rate,
        "total": total,
        "card_last4": last4,
        "card_brand": brand,
        "items": [
            {"id": it.id, "title": it.title, "qty": it.qty, "price": it.price, "protection_plan": bool(it.protection_plan)} for it in req.items
        ],
        "shipping": req.shipping.dict(),
        "email": req.email,
    }

    # persist to ORDERS in-memory store
    ORDERS[order_id] = order

    # if user present, append order to their account and persist to central store
    if user:
        try:
            # Get current user data to preserve existing fields
            current_user = find_user_by_token(user.get('token'))
            if current_user:
                # Append order to user's accounts[0].orders
                if not current_user.get('accounts'):
                    current_user['accounts'] = [{"account_id": 1000, "payment_methods": [], "orders": []}]
                current_user['accounts'][0].setdefault('orders', []).append(order)
                
                # Update user with new order and new wallet balance
                updates = {
                    'email': req.email,
                    'shippingAddress': {
                        'name': req.shipping.name,
                        'street': req.shipping.street,
                        'city': req.shipping.city,
                        'state': req.shipping.state,
                        'zip': req.shipping.zip,
                    },
                    'accounts': current_user.get('accounts', [])
                }
                update_user(str(user.get('id')), updates)
        except Exception:
            pass  # non-critical; order still succeeded

    return order

# ----------------------
# User / Account JSON store helpers and REST endpoints
# ----------------------
USERS_FILE = (_BASE / 'data' / 'users.json').resolve()
_users_lock = threading.Lock()
if not USERS_FILE.parent.exists():
    os.makedirs(USERS_FILE.parent, exist_ok=True)

def _read_users_store() -> Dict[str, Any]:
    if not USERS_FILE.exists():
        return {"users": []}
    try:
        with USERS_FILE.open('r', encoding='utf-8') as fh:
            return json.load(fh)
    except Exception:
        return {"users": []}

def _write_users_store(data: Dict[str, Any]):
    # atomic write
    tmp = USERS_FILE.with_suffix('.tmp')
    with _users_lock:
        with tmp.open('w', encoding='utf-8') as fh:
            json.dump(data, fh, indent=2)
        os.replace(str(tmp), str(USERS_FILE))

def _find_user_by_username(username: str):
    data = _read_users_store()
    for u in data.get('users', []):
        if u.get('username') == username:
            return u
    return None

def _find_user_by_token(token: str):
    data = _read_users_store()
    for u in data.get('users', []):
        if u.get('token') == token:
            return u
    return None

def _save_user(user: Dict[str, Any]):
    data = _read_users_store()
    users = data.get('users', [])
    for i, u in enumerate(users):
        if u.get('id') == user.get('id'):
            users[i] = user
            _write_users_store({"users": users})
            return
    users.append(user)
    _write_users_store({"users": users})

def _create_user(username: str, password: str):
    data = _read_users_store()
    users = data.get('users', [])
    uid = uuid.uuid4().hex
    token = uuid.uuid4().hex
    initial_wallet = round(random.uniform(10, 200), 2)
    # create base account
    next_acc_id = 1000 + sum(len(u.get('accounts', [])) for u in users)
    default_pm = []
    # create 1-2 default payment methods by sampling SAVED_CARDS
    sample = SAVED_CARDS[:2]
    for c in sample:
        pm = {"id": c['id'], "brand": c['brand'], "masked": f"••••{c['last4']}", "exp": c['exp']}
        default_pm.append(pm)
    account = {"account_id": next_acc_id, "payment_methods": default_pm, "orders": []}
    user = {
        "id": uid,
        "username": username,
        "password": password,
        "token": token,
        "created_at": datetime.utcnow().isoformat(),
        "wallet": {"balance": initial_wallet, "history": []},
        "accounts": [account],
        "email": username if '@' in username else '',
    }
    users.append(user)
    _write_users_store({"users": users})
    return user

def _append_order_to_user(user_id: str, order: Dict[str, Any]):
    data = _read_users_store()
    users = data.get('users', [])
    for u in users:
        if u.get('id') == user_id:
            # append to first account for simplicity
            if not u.get('accounts'):
                u.setdefault('accounts', []).append({"account_id": 1000, "payment_methods": [], "orders": []})
            u['accounts'][0].setdefault('orders', []).append(order)
            _write_users_store({"users": users})
            return True
    return False

def _modify_user_wallet(user_id: str, delta: float):
    data = _read_users_store()
    users = data.get('users', [])
    for u in users:
        if u.get('id') == user_id:
            u.setdefault('wallet', {}).setdefault('balance', 0)
            u['wallet']['balance'] = round(u['wallet']['balance'] + delta, 2)
            _write_users_store({"users": users})
            return True
    return False

def _grant_wallet_history(user_id: str, amount: float, reason: str, order_id: Optional[str]):
    data = _read_users_store()
    users = data.get('users', [])
    for u in users:
        if u.get('id') == user_id:
            entry = {"id": uuid.uuid4().hex, "amount": amount, "reason": reason, "date": datetime.utcnow().isoformat(), "order_id": order_id}
            u.setdefault('wallet', {}).setdefault('history', []).append(entry)
            _write_users_store({"users": users})
            return True
    return False

# REST endpoints for user/account management
class LoginRequest(BaseModel):
    username: str; password: str

class LoginResponse(BaseModel):
    user: Dict[str, Any]; token: str

@app.post('/login', response_model=LoginResponse)
def login(req: LoginRequest):
    # Use central store implementation so tokens and user shape match /api endpoints
    existing = find_user_by_username(req.username)
    if existing:
        # skip password validation for development/demo: accept existing user regardless of provided password
        try:
            profile = get_user_profile(str(existing.get('id')))
        except Exception:
            profile = None
        user_obj = (profile.get('user') if profile and profile.get('user') else existing)
        return {"user": user_obj, "token": user_obj.get('token')}

    # if not in central store, check legacy store and migrate if present
    try:
        legacy_user = _find_user_by_username(req.username)
    except Exception:
        legacy_user = None
    if legacy_user:
        # try best-effort migration
        try:
            _migrate_single_legacy_user(legacy_user)
        except Exception:
            pass

        # locate central user by legacy token or username
        central = None
        if legacy_user.get('token'):
            central = find_user_by_token(legacy_user.get('token'))
        if not central:
            central = find_user_by_username(legacy_user.get('username') or legacy_user.get('email'))

        # if still not found, create a central user and preserve legacy fields
        if not central:
            created = create_user(legacy_user.get('username') or legacy_user.get('email'), legacy_user.get('password') or '')
            central = created.get('user') if isinstance(created, dict) and created.get('user') else created
            updates = {}
            if legacy_user.get('token'):
                updates['token'] = legacy_user.get('token')
            lw = legacy_user.get('wallet') or {}
            if 'balance' in lw:
                updates['walletBalance'] = lw.get('balance')
            if legacy_user.get('email'):
                updates['email'] = legacy_user.get('email')
            if legacy_user.get('shippingAddress'):
                updates['shippingAddress'] = legacy_user.get('shippingAddress')
            if updates:
                try:
                    update_user(str(central.get('id')), updates)
                except Exception:
                    pass

        # return normalized central profile
        try:
            profile = get_user_profile(str(central.get('id')))
        except Exception:
            profile = None
        user_obj = (profile.get('user') if profile and profile.get('user') else central)

        return {"user": user_obj, "token": user_obj.get('token')}

    # no user found in central or legacy store: create a new one
    created = create_user(req.username, req.password or '')
    new_user = created.get('user') if isinstance(created, dict) and created.get('user') else created
    try:
        profile = get_user_profile(str(new_user.get('id')))
    except Exception:
        profile = None
    user_obj = (profile.get('user') if profile and profile.get('user') else new_user)
    return {"user": user_obj, "token": user_obj.get('token')}

# Auth dependency - must be defined before endpoints that use it
# (MOVED to earlier in file to be available for /wallet and /orders endpoints)

@app.get('/account')
@app.get('/api/account')
def account_endpoint(user: dict = Depends(require_auth)):
    """Return account-centric data (wallet balance, shipping address, payment methods, subscriptions, entitlements, wallet grants/usage) for the authenticated user."""

    # Get wallet balance from user
    walletBalance = user.get('walletBalance') if user.get('walletBalance') is not None else (
        user.get('wallet', {}).get('balance', 0) if isinstance(user, dict) else 0
    )

    # Build sample account response matching expected structure with subscriptions and entitlements
    # Use subscription dates that align with wallet grants
    wallet_grants = WALLET.get('grants', [])
    subscriptions = []
    
    for grant in wallet_grants:
        try:
            # Parse grant date for subscription start
            grant_date = datetime.strptime(grant['date'], '%Y-%m-%d')
            grant_timestamp = int(grant_date.timestamp() * 1000)
            
            # Parse expiry date if available
            expiry_timestamp = grant_timestamp + 86400000 * 365  # default 1 year
            if grant.get('expires'):
                try:
                    expiry_date = datetime.strptime(grant['expires'], '%Y-%m-%d')
                    expiry_timestamp = int(expiry_date.timestamp() * 1000)
                except:
                    pass
            
            subscription = {
                "association": {
                    "flags": {
                        "mint.permission.administration": "false",
                        "mint.permission.delete": "true",
                        "mint.permission.read": "true",
                        "mint.enabledByUser": "true",
                        "mint.permission.write": "true",
                        "mint.permission.timeofday": "false",
                        "mint.status.requested": "false",
                        "mint.permission.create": "false",
                        "mint.status.suspend": "false",
                        "mint.permission.execute": "true",
                        "mint.permission.transient": "false",
                        "mint.status.activating": "false",
                        "mint.role": "mint.role.primary"
                    }
                },
                "activatedDate": grant_timestamp,
                "createdDate": grant_timestamp,
                "status": "activated",
                "id": hash(grant['id']) % 99999,
                "type": "marketplace_grant",
                "displayName": grant['reason'],
                "attributes": {
                    "paymentProviderSubscriptions": [
                        {
                            "id": hash(grant['id']) % 99999,
                            "providerSubscriptionId": f"grant_{grant['id']}",
                            "subscriptionStartDate": grant_timestamp,
                            "subscriptionEndDate": expiry_timestamp,
                            "billingState": "GOOD_STANDING",
                            "subscriptionStatus": "ACTIVE",
                            "nextSubscriptionPrice": grant['amount'],
                            "subscriptionCurrency": "USD",
                            "purchaseSource": "MARKETPLACE",
                            "serviceType": "GRANT",
                            "paymentMethod": {
                                "id": 303208,
                                "paymentMethodId": f"PM-{uuid.uuid4().hex[:12]}",
                                "active": True,
                                "primary": True,
                                "status": "ACTIVE",
                                "classType": "com.uxpsystems.mint.attributes.WalletCredit"
                            },
                            "subscriptionItems": [
                                {
                                    "id": hash(grant['id']) % 999999,
                                    "productId": f"GRANT-{grant['id']}",
                                    "productDescription": grant['reason'],
                                    "subscriptionPrice": grant['amount'],
                                    "plmCode": "wallet_grant"
                                }
                            ],
                            "maxUser": 1,
                            "productDescription": grant['reason'],
                            "subscriptionPrice": grant['amount'],
                            "productId": f"GRANT-{grant['id']}",
                            "plmCode": "wallet_grant"
                        }
                    ]
                }
            }
            subscriptions.append(subscription)
        except Exception:
            pass

    account = {
        "association": {
            "flags": {
                "mint.permission.administration": "false",
                "mint.permission.delete": "true",
                "mint.permission.read": "true",
                "mint.enabledByUser": "true",
                "mint.permission.write": "true",
                "mint.permission.timeofday": "false",
                "mint.status.requested": "false",
                "mint.permission.create": "false",
                "mint.status.suspend": "false",
                "mint.permission.execute": "true",
                "mint.permission.transient": "false",
                "mint.status.activating": "false",
                "mint.role": "mint.role.primary"
            }
        },
        "activatedDate": int(datetime.utcnow().timestamp() * 1000) - 86400000,  # yesterday
        "createdDate": int(datetime.utcnow().timestamp() * 1000) - 86400000 * 30,  # 30 days ago
        "status": "activated",
        "id": hash(user.get('id', 'default')) % 999999,
        "type": "PaymentProviderAccount",
        "displayName": user.get('username', 'Account')[:12].upper(),
        "subscriptions": subscriptions,
        "attributes": {
            "entitlements": [
                {
                    "id": i,
                    "entitlementId": f"GRANT-{grant['id']}",
                    "productId": f"GRANT-{grant['id']}",
                    "productDescription": grant['reason'],
                    "plmCode": "wallet_grant",
                    "status": "activated",
                    "startDate": int(datetime.strptime(grant['date'], '%Y-%m-%d').timestamp() * 1000),
                }
                for i, grant in enumerate(wallet_grants)
            ],
            "bssAccounts": [
                {
                    "id": 243994,
                    "accountId": user.get('username', 'account').upper(),
                    "addresses": [
                        {
                            "id": 243696,
                            "line1": "123 Tech Street",
                            "city": "San Francisco",
                            "county": "San Francisco",
                            "district": "CA",
                            "postalCode": "94105",
                            "country": "US"
                        }
                    ],
                    "metadata": {
                        "tier": "eligible",
                        "tierLastUpdated": datetime.utcnow().isoformat() + "Z"
                    }
                }
            ],
            "paymentDetails": [
                {
                    "id": 303208,
                    "paymentMethodId": f"PM-{uuid.uuid4().hex[:12]}",
                    "active": True,
                    "primary": True,
                    "status": "ACTIVE",
                    "classType": "com.uxpsystems.mint.attributes.CarrierBillingPayment"
                }
            ]
        }
    }

    # Extract shipping address from account
    shippingAddress = None
    try:
        if account['attributes']['bssAccounts']:
            addr = account['attributes']['bssAccounts'][0]['addresses'][0]
            shippingAddress = {
                "street": addr.get('line1', ''),
                "city": addr.get('city', ''),
                "state": addr.get('district', ''),
                "zip": addr.get('postalCode', ''),
            }
    except Exception:
        pass

    # Extract payment methods
    paymentMethods = []
    try:
        if account['attributes']['paymentDetails']:
            for pm in account['attributes']['paymentDetails']:
                paymentMethods.append({
                    "id": pm.get('id'),
                    "paymentMethodId": pm.get('paymentMethodId'),
                    "active": pm.get('active', True),
                    "primary": pm.get('primary', False),
                    "status": pm.get('status', 'ACTIVE'),
                })
    except Exception:
        pass

    return {
        'account': account,
        'walletBalance': walletBalance,
        'shippingAddress': shippingAddress,
        'paymentMethods': paymentMethods,
        'user': user,
    }

@app.delete('/api/users/{user_id}')
def api_delete_user(user_id: str, request: Request):
    """Delete a user and associated data. Only the user themselves (matching token) or any authenticated user may call this in this demo.
    In production this should require admin privileges.
    """
    # resolve authenticated user
    auth = request.headers.get('Authorization') or ''
    token = auth.split(' ', 1)[1].strip() if auth.startswith('Bearer ') else None
    auth_user = None
    try:
        if token:
            auth_user = find_user_by_token(token)
    except Exception:
        auth_user = None

    # allow if auth_user matches target user or if auth_user is present (relaxed for demo)
    if not auth_user:
        raise HTTPException(401, 'Unauthorized')

    # perform deletion
    try:
        ok = delete_user(user_id)
    except Exception as e:
        raise HTTPException(500, f'Deletion failed: {e}')
    if not ok:
        raise HTTPException(404, 'User not found')
    return {'ok': True}

@app.delete('/api/accounts/{account_id}')
def api_delete_account(account_id: str, request: Request):
    auth = request.headers.get('Authorization') or ''
    token = auth.split(' ', 1)[1].strip() if auth.startswith('Bearer ') else None
    try:
        if not token:
            raise HTTPException(401, 'Unauthorized')
        # allow any authenticated user in demo
        ok = delete_account(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f'Deletion failed: {e}')
    if not ok:
        raise HTTPException(404, 'Account not found')
    return {'ok': True}

@app.post('/api/admin/wipe-db')
@app.post('/admin/wipe-db')
def api_wipe_db():
    """Dangerous: wipe central db.json by writing an empty structure.
    NO AUTH REQUIRED (for demo/dev only).
    """
    try:
        write_db({"users": [], "accounts": [], "orders": []})
    except Exception as e:
        raise HTTPException(500, f"Wipe failed: {e}")
    return {"ok": True, "message": "db.json wiped (all users/accounts/orders deleted)"}

@app.delete('/api/admin/wipe-db')
@app.delete('/admin/wipe-db')
def api_wipe_db_delete():
    """Same as POST /api/admin/wipe-db - wipe all users and accounts."""
    return api_wipe_db()

def _migrate_single_legacy_user(legacy_user: dict) -> Optional[dict]:
    """Best-effort migration of a single legacy user record to central store."""
    if not legacy_user:
        return None
    try:
        uname = legacy_user.get('username') or legacy_user.get('email')
        if not uname:
            return None
        central = find_user_by_username(uname)
        if not central:
            created = create_user(uname, legacy_user.get('password') or '')
            central = created.get('user') if isinstance(created, dict) and created.get('user') else created
        updates = {}
        if legacy_user.get('token') and not central.get('token'):
            updates['token'] = legacy_user.get('token')
        lw = legacy_user.get('wallet') or {}
        if 'balance' in lw:
            updates['walletBalance'] = lw.get('balance')
        if legacy_user.get('email') and not central.get('email'):
            updates['email'] = legacy_user.get('email')
        if legacy_user.get('shippingAddress'):
            updates['shippingAddress'] = legacy_user.get('shippingAddress')
        if updates:
            update_user(str(central.get('id')), updates)
        return find_user_by_username(uname)
    except Exception:
        return None

@app.get('/api/profile')
@app.get('/profile')
def api_profile(user: dict = Depends(require_auth)):
    """Get authenticated user's profile with account and orders."""
    try:
        profile = get_user_profile(str(user.get('id')))
        if profile:
            return profile
    except Exception:
        pass
    # fallback: construct minimal profile from user object
    return {
        "user": user,
        "account": {},
        "orders": []
    }

@app.post('/api/logout')
@app.post('/logout')
def api_logout(user: dict = Depends(require_auth)):
    """Logout: invalidate user's token server-side."""
    try:
        update_user(str(user.get('id')), {'token': None})
    except Exception:
        pass
    return {'ok': True, 'message': 'Logged out'}

class UpdateAccountRequest(BaseModel):
    email: Optional[str] = None
    shippingAddress: Optional[Dict[str, str]] = None

@app.post('/api/account')
def update_account(req: UpdateAccountRequest, user: dict = Depends(require_auth)):
    """Update user's email and/or shipping address."""
    updates = {}
    if req.email:
        updates['email'] = req.email
    if req.shippingAddress:
        updates['shippingAddress'] = req.shippingAddress
    
    if not updates:
        raise HTTPException(400, 'No updates provided')
    
    try:
        update_user(str(user.get('id')), updates)
    except Exception as e:
        raise HTTPException(500, f'Update failed: {e}')
    
    # Return updated account data
    updated_user = find_user_by_token(user.get('token'))
    if not updated_user:
        updated_user = user
    
    return {
        'ok': True,
        'message': 'Account updated successfully',
        'user': updated_user,
    }