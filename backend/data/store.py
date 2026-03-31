import json
import os
import threading
import uuid
import random
from pathlib import Path
from typing import Dict, Any, Optional, List

ROOT = Path(__file__).parent
DB_FILE = (ROOT / 'db.json').resolve()
_lock = threading.Lock()

def _ensure_db():
    if not DB_FILE.parent.exists():
        DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DB_FILE.exists():
        init = {"users": [], "accounts": [], "orders": []}
        DB_FILE.write_text(json.dumps(init, indent=2), encoding='utf-8')

def read_db() -> Dict[str, Any]:
    _ensure_db()
    try:
        with DB_FILE.open('r', encoding='utf-8') as fh:
            return json.load(fh)
    except Exception:
        return {"users": [], "accounts": [], "orders": []}

def write_db(data: Dict[str, Any]):
    _ensure_db()
    tmp = DB_FILE.with_suffix('.tmp')
    with _lock:
        with tmp.open('w', encoding='utf-8') as fh:
            json.dump(data, fh, indent=2)
        os.replace(str(tmp), str(DB_FILE))

# helpers

def find_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    if not username:
        return None
    db = read_db()
    for u in db.get('users', []):
        dn = u.get('displayName') or u.get('username') or ''
        if dn.lower() == username.lower():
            return u
    return None

def find_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    db = read_db()
    for u in db.get('users', []):
        if u.get('token') == token:
            return u
    return None

def _next_account_id(db: Dict[str, Any]) -> str:
    # find highest AC##### pattern in accounts[].displayName or accounts[].accountId
    maxn = 10000
    for a in db.get('accounts', []):
        dn = a.get('displayName') or a.get('accountId') or ''
        if isinstance(dn, str) and dn.upper().startswith('AC'):
            suffix = dn[2:]
            if suffix.isdigit():
                n = int(suffix)
                if n > maxn:
                    maxn = n
    return f"AC{maxn + 1:05d}"

def _sample_payment_methods() -> List[Dict[str, Any]]:
    # create 1-2 simple payment method shapes
    methods = []
    num = random.choice([1, 2])
    for i in range(num):
        pm = {
            "id": random.randint(100000, 999999),
            "paymentMethodId": f"pm-{uuid.uuid4().hex[:8]}",
            "active": True,
            "primary": i == 0,
            "status": "ACTIVE",
            "classType": "com.uxpsystems.mint.attributes.CarrierBillingPayment"
        }
        methods.append(pm)
    return methods

def create_user(username: str, password: Optional[str] = None) -> Dict[str, Any]:
    db = read_db()
    users = db.setdefault('users', [])
    accounts = db.setdefault('accounts', [])

    # determine next numeric id (start at 1)
    max_id = 0
    for u in users:
        try:
            uid = int(u.get('id'))
            if uid > max_id:
                max_id = uid
        except Exception:
            continue
    new_id = str(max_id + 1)

    token = uuid.uuid4().hex
    walletBalance = random.choice([100,200,300,400,500,600])

    # create account with AC##### id
    acc_display = _next_account_id(db)
    account = {
        "userId": new_id,
        "accountId": acc_display,
        "displayName": acc_display,
        "paymentMethods": _sample_payment_methods(),
        "orders": []
    }

    # build user object following the requested shape
    user_obj = {
        "id": new_id,
        "avatarUrl": f"http://myavatar/{username}",
        "displayName": username,
        "status": "activated",
        "type": "com.uxpsystems.ulm.entity.RegularEntityType",
        "credentialSet": True,
        "attributes": {
            "com.uxpsystems.mint.user.FamilyName": "",
            "com.uxpsystems.mint.user.GivenName": "",
            "com.uxpsystems.mint.user.Language": "en",
            "domain": "",
            "preferredNotificationChannel": "",
            "branding": "",
            "secret2FATotp": "",
            "emails": [],
            "socialConnections": [],
        },
        # legacy fields used elsewhere in app
        "username": username,
        "password": password or "",
        "token": token,
        "email": (username if '@' in username else None),
        "shippingAddress": None,
        "walletBalance": walletBalance,
    }

    # populate emails array if email provided
    if user_obj.get('email'):
        user_obj['attributes']['emails'].append({"id": 0, "email": user_obj['email'], "mfaoption": True})

    users.append(user_obj)
    accounts.append(account)
    write_db(db)
    return {"user": user_obj, "account": account}

def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    db = read_db()
    user = next((u for u in db.get('users', []) if str(u.get('id')) == str(user_id)), None)
    if not user:
        return None
    account = next((a for a in db.get('accounts', []) if str(a.get('userId')) == str(user_id)), None)
    orders = [o for o in db.get('orders', []) if str(o.get('userId')) == str(user_id)]
    return {"user": user, "account": account, "orders": orders}

def save_order(order: Dict[str, Any]) -> Dict[str, Any]:
    db = read_db()
    orders = db.setdefault('orders', [])
    orders.append(order)
    write_db(db)
    return order

def update_user(user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = read_db()
    users = db.get('users', [])
    for i, u in enumerate(users):
        if str(u.get('id')) == str(user_id):
            users[i] = {**u, **fields}
            write_db(db)
            return users[i]
    return None

# convenience: find account for user
def find_account_by_user(user_id: str) -> Optional[Dict[str, Any]]:
    db = read_db()
    return next((a for a in db.get('accounts', []) if str(a.get('userId')) == str(user_id)), None)

def delete_user(user_id: str) -> bool:
    """Permanently remove a user, their accounts and their orders from the DB."""
    db = read_db()
    users = db.get('users', [])
    accounts = db.get('accounts', [])
    orders = db.get('orders', [])

    orig_u = len(users)
    users = [u for u in users if str(u.get('id')) != str(user_id)]
    removed_users = orig_u - len(users)

    # remove accounts for that user
    orig_a = len(accounts)
    accounts = [a for a in accounts if str(a.get('userId')) != str(user_id)]
    removed_accounts = orig_a - len(accounts)

    # remove orders for that user
    orig_o = len(orders)
    orders = [o for o in orders if str(o.get('userId')) != str(user_id)]
    removed_orders = orig_o - len(orders)

    db['users'] = users
    db['accounts'] = accounts
    db['orders'] = orders
    write_db(db)
    return removed_users > 0


def delete_account(account_id: str) -> bool:
    """Permanently remove an account by accountId or displayName from the DB and its orders.
    Returns True if an account was removed.
    """
    db = read_db()
    accounts = db.get('accounts', [])
    orders = db.get('orders', [])

    def match_acc(a):
        if not a: return False
        if str(a.get('accountId')) == str(account_id):
            return True
        if str(a.get('displayName')) == str(account_id):
            return True
        return False

    orig_a = len(accounts)
    accounts = [a for a in accounts if not match_acc(a)]
    removed_accounts = orig_a - len(accounts)

    # remove orders pointing to removed accounts' userIds
    # find userIds for removed accounts by comparing against original accounts
    # We need original accounts list to compute removed userIds; read original from DB snapshot
    # Re-read original snapshot
    db_orig = read_db()
    orig_accounts = db_orig.get('accounts', [])
    removed_user_ids = set([str(a.get('userId')) for a in orig_accounts if match_acc(a)])

    orig_o = len(orders)
    orders = [o for o in orders if str(o.get('userId')) not in removed_user_ids]
    removed_orders = orig_o - len(orders)

    db['accounts'] = accounts
    db['orders'] = orders
    write_db(db)
    return removed_accounts > 0
