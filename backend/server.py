import os
import re
import time
import hmac
import hashlib
import secrets
import httpx
import asyncio
import logging
import jwt
from collections import defaultdict, deque
from urllib.parse import quote
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
from pymongo import UpdateOne
from pydantic import BaseModel
from typing import Optional

load_dotenv()
logger = logging.getLogger("pos")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mercalo_pos")
WC_URL = os.environ.get("WC_URL", "https://mercalo.co")
WC_KEY = os.environ.get("WC_CONSUMER_KEY", "")
WC_SECRET = os.environ.get("WC_CONSUMER_SECRET", "")
WC_WEBHOOK_SECRET = os.environ.get("WC_WEBHOOK_SECRET", "mercalo-pos-webhook-2026")
SYNC_INTERVAL_MINUTES = int(os.environ.get("SYNC_INTERVAL_MINUTES", "10"))
# Sync liviano: cada intervalo solo se traen los productos modificados; el sync completo (todo el catalogo,
# variaciones y borrados) corre cada FULL_SYNC_HOURS. WC_PAUSE_SECONDS espacia las llamadas a WooCommerce
# para no activar el firewall anti-bots del hosting.
FULL_SYNC_HOURS = float(os.environ.get("FULL_SYNC_HOURS", "6"))
WC_PAUSE_SECONDS = float(os.environ.get("WC_PAUSE_SECONDS", "0.4"))
# Login con PIN para proteger /orders/recent, /orders/stats y /orders/operators.
# Si ORDERS_PIN queda vacio (por defecto), esos endpoints siguen funcionando igual que hoy, sin login.
ORDERS_PIN = os.environ.get("ORDERS_PIN", "")
# Firma los tokens de sesion. Si no se configura, se genera uno aleatorio al iniciar
# (las sesiones activas se invalidan en cada redeploy, lo cual es aceptable para este uso).
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
SESSION_HOURS = 8

P = "/api"

# Interruptor de emergencia: con HIDE_MEAT_PROMOS=1 en Railway, los productos de estas categorias se muestran
# y cobran siempre a precio regular (ignora ofertas). Por defecto esta apagado: se respeta lo que diga WooCommerce.
HIDE_MEAT_PROMOS = os.environ.get("HIDE_MEAT_PROMOS", "0") == "1"
MEAT_CATEGORY_IDS = [260, 300, 301, 302]  # Carne Pollo y Pescado, Carne, Pescado, Pollo


def strip_meat_promo(doc):
    """Quita ofertas de un producto de carnes (precio = precio regular). Modifica y devuelve el doc."""
    if not HIDE_MEAT_PROMOS or not doc:
        return doc
    if not any(c.get("id") in MEAT_CATEGORY_IDS for c in doc.get("categories") or []):
        return doc
    if "on_sale" in doc:
        doc["on_sale"] = False
    if "sale_price" in doc:
        doc["sale_price"] = ""
    regular = doc.get("regular_price")
    if regular:
        doc["price"] = regular
    regulars = []
    for v in doc.get("variations") or []:
        if v.get("regular_price"):
            try:
                regulars.append(float(v["regular_price"]))
                v["price"] = v["regular_price"]
            except (TypeError, ValueError):
                pass
        v["sale_price"] = ""
    if not regular and regulars and doc.get("product_type") == "variable":
        doc["price"] = str(int(min(regulars)))
    return doc


# ─── Rate limiting simple (sin dependencias externas) ───

_rate_buckets = defaultdict(deque)


def err_text(e: Exception) -> str:
    """Texto de error legible: incluye el tipo (algunas excepciones, como los timeouts, vienen con mensaje vacio)."""
    return f"{type(e).__name__}: {e}".strip(": ")


def rate_limit(request: Request, bucket: str, max_requests: int = 30, window_seconds: int = 60):
    """Limite simple por IP + endpoint usando ventana deslizante en memoria."""
    ip = request.client.host if request.client else "unknown"
    key = f"{bucket}:{ip}"
    now = time.monotonic()
    q = _rate_buckets[key]
    while q and now - q[0] > window_seconds:
        q.popleft()
    if len(q) >= max_requests:
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes, intenta de nuevo en un momento")
    q.append(now)


def create_session_token() -> str:
    payload = {
        "role": "operator",
        "exp": datetime.now(timezone.utc).timestamp() + SESSION_HOURS * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def require_session(authorization: str = Header(default="")):
    """Exige un token de sesion valido (Bearer) para el panel de operadora.
    Mientras ORDERS_PIN no este configurado, nadie puede iniciar sesion, asi que
    estos endpoints quedan completamente bloqueados (panel de operadora "apagado")."""
    token = authorization[7:].strip() if authorization.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="No autorizado")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sesion invalida o expirada")


def phone_regex_prefix(phone: str) -> str:
    """Escapa caracteres especiales y ancla al inicio para evitar inyeccion/ReDoS en Mongo regex."""
    return f"^{re.escape(phone.strip())}"


# ─── Background Sync ───

async def background_sync(app):
    """Sync periodico liviano: incremental cada SYNC_INTERVAL_MINUTES y completo cada FULL_SYNC_HOURS.
    Si falla (p. ej. bloqueo del firewall), espera cada vez mas antes de reintentar en vez de insistir."""
    last_full = None          # monotonic del ultimo sync completo exitoso
    last_started = None       # datetime UTC de inicio del ultimo sync exitoso (base del incremental)
    failures = 0
    while True:
        await asyncio.sleep(SYNC_INTERVAL_MINUTES * 60 * min(2 ** failures, 6))
        db = app.state.db
        full = last_full is None or (time.monotonic() - last_full) >= FULL_SYNC_HOURS * 3600
        started = datetime.now(timezone.utc)
        try:
            if full:
                logger.info("Background sync (completo) starting...")
                await run_full_sync(db)
                await run_variations_sync(db)
                await sync_shipping_from_wc(db)
                last_full = time.monotonic()
            else:
                since = (last_started - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%S")
                logger.info(f"Background sync (incremental desde {since}) starting...")
                await run_incremental_sync(db, since)
            last_started = started
            failures = 0
            await db.sync_log.insert_one({
                "type": "periodic" if full else "incremental", "status": "ok",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Background sync completed")
        except Exception as e:
            failures += 1
            logger.error(f"Background sync error: {err_text(e)}")
            try:
                await db.sync_log.insert_one({
                    "type": "periodic" if full else "incremental", "status": "error", "error": err_text(e)[:500],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    port = os.environ.get("PORT", "8000")
    logger.info(f"Starting on port {port}, DB={DB_NAME}, WC={WC_URL}")
    app.state.mongo = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    app.state.db = app.state.mongo[DB_NAME]
    db = app.state.db
    try:
        await db.products.create_index([("search_text", "text")])
        await db.products.create_index("woo_id", unique=True)
        await db.products.create_index([("total_sales", -1)])
        await db.products.create_index("categories.id")
        logger.info("MongoDB indexes OK")
    except Exception as e:
        logger.warning(f"MongoDB index creation failed (app will still start): {e}")
    sync_task = asyncio.create_task(background_sync(app))
    yield
    sync_task.cancel()
    app.state.mongo.close()


app = FastAPI(lifespan=lifespan)
_default_origins = [
    "https://mercalo-pos-production.up.railway.app",
    "https://mercalo.co",
    "https://www.mercalo.co",
]
_extra_origin = os.environ.get("EXTRA_ALLOWED_ORIGIN", "")
ALLOWED_ORIGINS = _default_origins + ([_extra_origin] if _extra_origin else [])
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def get_db():
    return app.state.db


# ─── WooCommerce Helpers ───

async def wc_fetch_page(client, endpoint, page, per_page=100, extra=None):
    params = {
        "consumer_key": WC_KEY, "consumer_secret": WC_SECRET,
        "per_page": per_page, "page": page, "status": "publish",
        **(extra or {}),
    }
    resp = await client.get(f"{WC_URL}/wp-json/wc/v3/{endpoint}", params=params,
                            headers={"User-Agent": "MercaloPOS/1.0"}, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"WooCommerce respondio {resp.status_code} en {endpoint} pagina {page}: {resp.text[:150]!r}")
    total = int(resp.headers.get("x-wp-total", 0))
    total_pages = int(resp.headers.get("x-wp-totalpages", 0))
    return resp.json(), total, total_pages


def product_to_doc(p):
    img = p["images"][0]["src"] if p.get("images") else ""
    cats = [{"id": c["id"], "name": c["name"]} for c in p.get("categories", [])]
    name, sku = p.get("name", ""), p.get("sku", "")
    attributes = [{"name": a["name"], "options": a.get("options", [])}
                  for a in p.get("attributes", []) if a.get("variation")]
    wpp_meta = {}
    for m in p.get("meta_data", []):
        if m["key"] == "_wpp_enable" and m["value"] == "yes":
            wpp_meta["enabled"] = True
        elif m["key"] == "_wpp_price_per_kg":
            wpp_meta["price_per_kg"] = m["value"]
        elif m["key"] == "_wpp_avg_weight_und":
            wpp_meta["avg_weight_und"] = m["value"]
    return {
        "woo_id": p["id"], "name": name, "sku": sku,
        "price": p.get("price", "0"), "regular_price": p.get("regular_price", ""),
        "sale_price": p.get("sale_price", ""),
        "on_sale": p.get("on_sale", False),
        "stock_quantity": p.get("stock_quantity"), "stock_status": p.get("stock_status", "instock"),
        "image_url": img, "categories": cats, "total_sales": p.get("total_sales", 0),
        "search_text": f"{name} {sku}".lower().strip(),
        "product_type": p.get("type", "simple"),
        "attributes": attributes,
        "wpp": wpp_meta if wpp_meta.get("enabled") else None,
        "short_description": p.get("short_description", ""),
    }


# ─── Reusable Sync Functions ───

def variation_docs(items, parent_id):
    return [{
        "variation_id": v["id"], "parent_id": parent_id,
        "attributes": {a["name"]: a["option"] for a in v.get("attributes", [])},
        "price": v.get("price", "0"), "regular_price": v.get("regular_price", ""),
        "sale_price": v.get("sale_price", ""), "sku": v.get("sku", ""),
        "stock_status": v.get("stock_status", "instock"),
        "stock_quantity": v.get("stock_quantity"),
        "image_url": (v.get("image") or {}).get("src", ""),
    } for v in items]


async def run_full_sync(db):
    all_woo_ids = set()
    async with httpx.AsyncClient() as client:
        data, total, total_pages = await wc_fetch_page(client, "products", 1)
        synced = 0
        ops = [UpdateOne({"woo_id": product_to_doc(p)["woo_id"]}, {"$set": product_to_doc(p)}, upsert=True) for p in data]
        all_woo_ids.update(product_to_doc(p)["woo_id"] for p in data)
        if ops:
            await db.products.bulk_write(ops, ordered=False)
            synced += len(ops)
        failed_pages = 0
        for batch_start in range(2, total_pages + 1, 2):
            await asyncio.sleep(WC_PAUSE_SECONDS)
            batch_end = min(batch_start + 2, total_pages + 1)
            tasks = [wc_fetch_page(client, "products", pg) for pg in range(batch_start, batch_end)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            ops = []
            for r in results:
                if isinstance(r, Exception):
                    failed_pages += 1
                    logger.error(f"Sync page failed: {err_text(r)}")
                    continue
                for p in r[0]:
                    doc = product_to_doc(p)
                    all_woo_ids.add(doc["woo_id"])
                    ops.append(UpdateOne({"woo_id": doc["woo_id"]}, {"$set": doc}, upsert=True))
            if ops:
                await db.products.bulk_write(ops, ordered=False)
                synced += len(ops)
    if failed_pages:
        raise RuntimeError(f"Sync incompleto: fallaron {failed_pages} paginas de WooCommerce")
    # Remove products no longer in WooCommerce (trashed/deleted/draft)
    if all_woo_ids:
        deleted = await db.products.delete_many({"woo_id": {"$nin": list(all_woo_ids)}})
        if deleted.deleted_count:
            logger.info(f"Removed {deleted.deleted_count} products no longer in WooCommerce")
    return synced, total


async def run_variations_sync(db, parent_ids=None):
    query = {"product_type": "variable"}
    if parent_ids is not None:
        query["woo_id"] = {"$in": list(parent_ids)}
    variable_products = await db.products.find(query, {"_id": 0, "woo_id": 1}).to_list(500)
    synced = 0
    failed = 0
    async with httpx.AsyncClient() as client:
        for batch_start in range(0, len(variable_products), 2):
            if batch_start:
                await asyncio.sleep(WC_PAUSE_SECONDS)
            batch = variable_products[batch_start:batch_start + 2]
            tasks = [client.get(
                f"{WC_URL}/wp-json/wc/v3/products/{vp['woo_id']}/variations",
                params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET, "per_page": 100},
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=30,
            ) for vp in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, r in enumerate(results):
                if isinstance(r, Exception) or r.status_code != 200:
                    failed += 1
                    continue
                parent_id = batch[i]["woo_id"]
                var_docs = variation_docs(r.json(), parent_id)
                if var_docs:
                    await db.products.update_one({"woo_id": parent_id}, {"$set": {"variations": var_docs}})
                    synced += len(var_docs)
    if failed:
        logger.error(f"Variations sync: {failed} productos fallaron")
        if failed == len(variable_products):
            raise RuntimeError("No se pudo sincronizar ninguna variacion desde WooCommerce")
    return synced, len(variable_products)


async def run_incremental_sync(db, since_iso):
    """Trae solo los productos modificados desde since_iso (UTC) y las variaciones de los variables."""
    changed_ids, variable_ids, page, total_pages = [], [], 1, 1
    async with httpx.AsyncClient() as client:
        while page <= total_pages:
            if page > 1:
                await asyncio.sleep(WC_PAUSE_SECONDS)
            data, _, total_pages = await wc_fetch_page(
                client, "products", page, extra={"modified_after": since_iso, "dates_are_gmt": "true"})
            total_pages = max(total_pages, 1)
            docs = [product_to_doc(p) for p in data]
            if docs:
                await db.products.bulk_write(
                    [UpdateOne({"woo_id": d["woo_id"]}, {"$set": d}, upsert=True) for d in docs], ordered=False)
            changed_ids += [d["woo_id"] for d in docs]
            variable_ids += [d["woo_id"] for d in docs if d["product_type"] == "variable"]
            page += 1
    if variable_ids:
        await run_variations_sync(db, parent_ids=variable_ids)
    logger.info(f"Incremental sync: {len(changed_ids)} productos modificados")
    return len(changed_ids)


async def sync_single_product(db, product_id):
    """Sync one product + its variations from WooCommerce."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{WC_URL}/wp-json/wc/v3/products/{product_id}",
            params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET},
            headers={"User-Agent": "MercaloPOS/1.0"}, timeout=30,
        )
        if resp.status_code != 200:
            return False
        p = resp.json()
        doc = product_to_doc(p)
        await db.products.update_one({"woo_id": doc["woo_id"]}, {"$set": doc}, upsert=True)

        if doc["product_type"] == "variable":
            var_resp = await client.get(
                f"{WC_URL}/wp-json/wc/v3/products/{product_id}/variations",
                params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET, "per_page": 100},
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=30,
            )
            if var_resp.status_code == 200:
                var_docs = variation_docs(var_resp.json(), product_id)
                if var_docs:
                    await db.products.update_one({"woo_id": product_id}, {"$set": {"variations": var_docs}})
        return True


# ─── API Endpoints ───

@app.get(f"{P}/health")
async def health():
    return {"status": "ok"}


@app.get(f"{P}/products/sync")
async def sync_products(request: Request):
    rate_limit(request, "products-sync", max_requests=5, window_seconds=60)
    db = get_db()
    try:
        synced, total = await run_full_sync(db)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sync fallo: {err_text(e)[:300]}")
    count = await db.products.count_documents({})
    await db.sync_log.insert_one({"type": "manual", "status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()})
    return {"synced": synced, "total_in_cache": count, "wc_total": total}


@app.get(f"{P}/products/sync-variations")
async def sync_variations(request: Request):
    rate_limit(request, "products-sync-variations", max_requests=5, window_seconds=60)
    db = get_db()
    try:
        synced, var_count = await run_variations_sync(db)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sync de variaciones fallo: {err_text(e)[:300]}")
    return {"synced_variations": synced, "variable_products": var_count}


@app.get(f"{P}/products/sync-status")
async def sync_status():
    db = get_db()
    count = await db.products.count_documents({})
    last_sync = await db.sync_log.find_one({}, sort=[("timestamp", -1)], projection={"_id": 0})
    return {"total_in_cache": count, "last_sync": last_sync, "sync_interval_minutes": SYNC_INTERVAL_MINUTES}


@app.get(f"{P}/products/search")
async def search_products(request: Request, q: str = Query("", min_length=0), limit: int = Query(10, le=20)):
    rate_limit(request, "products-search", max_requests=120, window_seconds=60)
    db = get_db()
    if not q.strip():
        return []
    regex_pattern = ".*".join(re.escape(w) for w in q.strip().lower().split())
    pipeline = [
        {"$match": {"search_text": {"$regex": regex_pattern, "$options": "i"}}},
        {"$sort": {"total_sales": -1}}, {"$limit": limit},
        {"$project": {"_id": 0, "search_text": 0}},
    ]
    return [strip_meat_promo(d) for d in await db.products.aggregate(pipeline).to_list(limit)]


@app.get(f"{P}/products/suggested")
async def suggested_products(request: Request, q: str = Query("", min_length=0)):
    rate_limit(request, "products-suggested", max_requests=120, window_seconds=60)
    db = get_db()
    if not q.strip():
        return []
    regex_pattern = ".*".join(re.escape(w) for w in q.strip().lower().split())
    pipeline = [
        {"$match": {"search_text": {"$regex": regex_pattern, "$options": "i"}}},
        {"$sort": {"total_sales": -1}}, {"$limit": 5},
        {"$project": {"_id": 0, "search_text": 0}},
    ]
    return [strip_meat_promo(d) for d in await db.products.aggregate(pipeline).to_list(5)]


@app.get(f"{P}/products/top-sellers")
async def top_sellers(category_id: int = Query(None), limit: int = Query(50, le=100), offset: int = Query(0)):
    db = get_db()
    match = {"price": {"$nin": ["", "0", "0.00", None]}}
    if category_id:
        # Resolve parent → children: include subcategory products
        children = await db.categories_cache.find(
            {"parent": category_id}, {"_id": 0, "id": 1}
        ).to_list(100)
        all_ids = [category_id] + [c["id"] for c in children]
        match["categories.id"] = {"$in": all_ids}
    pipeline = [
        {"$match": match}, {"$sort": {"total_sales": -1, "woo_id": 1}},
        {"$skip": offset}, {"$limit": limit},
        {"$project": {"_id": 0, "search_text": 0}},
    ]
    return [strip_meat_promo(d) for d in await db.products.aggregate(pipeline).to_list(limit)]


@app.get(f"{P}/products/offers")
async def get_offers(limit: int = Query(50, le=100)):
    """Get all products currently on sale."""
    db = get_db()
    match = {
        "$or": [
            {"on_sale": True, "sale_price": {"$nin": ["", None]}},
            {"on_sale": True, "product_type": "variable"},
            {"short_description": {"$regex": "^combo:"}},
        ],
    }
    if HIDE_MEAT_PROMOS:
        match["categories.id"] = {"$nin": MEAT_CATEGORY_IDS}
    pipeline = [
        {"$match": match},
        {"$sort": {"total_sales": -1}},
        {"$limit": limit},
        {"$project": {"_id": 0, "search_text": 0}},
    ]
    return await db.products.aggregate(pipeline).to_list(limit)


@app.post(f"{P}/products/by-ids")
async def products_by_ids(request: Request):
    """Get multiple products by their woo_ids with current prices."""
    rate_limit(request, "products-by-ids", max_requests=60, window_seconds=60)
    db = get_db()
    body = await request.json()
    ids = (body.get("ids") or [])[:100]
    if not ids:
        return []
    products = await db.products.find(
        {"woo_id": {"$in": ids}},
        {"_id": 0, "search_text": 0}
    ).to_list(100)
    return [strip_meat_promo(p) for p in products]


@app.get("/api/products/{product_id}/variations")
async def get_variations(product_id: int):
    db = get_db()
    product = await db.products.find_one(
        {"woo_id": product_id},
        {"_id": 0, "variations": 1, "attributes": 1, "wpp": 1, "product_type": 1, "categories": 1}
    )
    if not product:
        return {"variations": [], "attributes": [], "wpp": None}
    strip_meat_promo(product)
    return {
        "variations": product.get("variations", []),
        "attributes": product.get("attributes", []),
        "wpp": product.get("wpp"),
        "product_type": product.get("product_type", "simple"),
    }


@app.get(f"{P}/categories")
async def get_categories():
    db = get_db()
    # Get parent categories from cache
    parents = await db.categories_cache.find({"parent": 0}, {"_id": 0}).sort("count", -1).to_list(100)
    if not parents:
        # Fallback: aggregate from products
        pipeline = [
            {"$unwind": "$categories"},
            {"$group": {"_id": "$categories.id", "name": {"$first": "$categories.name"}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$project": {"_id": 0, "id": "$_id", "name": 1, "count": 1}},
        ]
        return await db.products.aggregate(pipeline).to_list(200)
    # Enrich count: count real products in our cache per parent category
    all_cats = await db.categories_cache.find({}, {"_id": 0, "id": 1, "parent": 1}).to_list(500)
    for p in parents:
        children_ids = [c["id"] for c in all_cats if c.get("parent") == p["id"]]
        all_ids = [p["id"]] + children_ids
        p["count"] = await db.products.count_documents({
            "categories.id": {"$in": all_ids},
            "price": {"$nin": ["", "0", "0.00", None]},
        })
    parents.sort(key=lambda x: x["count"], reverse=True)
    return parents


@app.get(f"{P}/categories/sync")
async def sync_categories(request: Request):
    """Sync categories from WooCommerce to get parent info."""
    rate_limit(request, "categories-sync", max_requests=5, window_seconds=60)
    db = get_db()
    all_cats = []
    page = 1
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                f"{WC_URL}/wp-json/wc/v3/products/categories",
                params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET, "per_page": 100, "page": page},
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=30,
            )
            if resp.status_code != 200:
                break
            cats = resp.json()
            if not cats:
                break
            all_cats.extend(cats)
            page += 1
    ops = []
    for c in all_cats:
        ops.append(UpdateOne(
            {"id": c["id"]},
            {"$set": {"id": c["id"], "name": c["name"], "parent": c.get("parent", 0), "count": c.get("count", 0), "slug": c.get("slug", "")}},
            upsert=True
        ))
    if ops:
        await db.categories_cache.bulk_write(ops, ordered=False)
    parent_cats = await db.categories_cache.find({"parent": 0}, {"_id": 0}).sort("count", -1).to_list(100)
    return parent_cats


# ─── Shipping Zones ───

@app.get(f"{P}/shipping/zones")
async def get_shipping_zones():
    """Get shipping zones/rates from cache or WooCommerce."""
    db = get_db()
    cached = await db.shipping_cache.find({}, {"_id": 0}).sort("cost", 1).to_list(50)
    if cached:
        return cached
    return await sync_shipping_from_wc(db)


@app.get(f"{P}/shipping/sync")
async def sync_shipping(request: Request):
    """Force sync shipping zones from WooCommerce."""
    rate_limit(request, "shipping-sync", max_requests=5, window_seconds=60)
    db = get_db()
    return await sync_shipping_from_wc(db)


async def sync_shipping_from_wc(db):
    """Fetch all shipping zones and methods from WooCommerce."""
    all_methods = []
    async with httpx.AsyncClient() as client:
        # Get all zones
        resp = await client.get(
            f"{WC_URL}/wp-json/wc/v3/shipping/zones",
            params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET},
            headers={"User-Agent": "MercaloPOS/1.0"}, timeout=15,
        )
        if resp.status_code != 200:
            return []
        zones = resp.json()
        for zone in zones:
            zid = zone["id"]
            mr = await client.get(
                f"{WC_URL}/wp-json/wc/v3/shipping/zones/{zid}/methods",
                params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET},
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=15,
            )
            if mr.status_code != 200:
                continue
            for m in mr.json():
                if not m.get("enabled"):
                    continue
                settings = m.get("settings", {})
                cost_str = settings.get("cost", {}).get("value", "0")
                try:
                    cost = float(cost_str)
                except (ValueError, TypeError):
                    cost = 0
                all_methods.append({
                    "method_id": m["id"],
                    "zone_id": zid,
                    "zone_name": zone["name"],
                    "title": m.get("title", ""),
                    "cost": cost,
                    "wc_method_id": m.get("method_id", ""),
                })
    if all_methods:
        await db.shipping_cache.delete_many({})
        await db.shipping_cache.insert_many([{**m} for m in all_methods])
    # Return without _id
    return [{k: v for k, v in m.items() if k != "_id"} for m in all_methods]


# ─── Webhook: WooCommerce Product Updates ───

def verify_wc_signature(body: bytes, signature: str) -> bool:
    """Verifica la firma HMAC que manda WooCommerce en sus webhooks.
    Si no llega firma, se deja pasar (algunos webhooks pueden no tener secreto configurado en WC)."""
    if not signature:
        return True
    import base64
    expected = hmac.new(WC_WEBHOOK_SECRET.encode(), body, hashlib.sha256).digest()
    expected_b64 = base64.b64encode(expected).decode()
    return hmac.compare_digest(signature, expected_b64)


@app.post(f"{P}/webhooks/product-updated")
async def webhook_product_updated(request: Request):
    """Webhook called by WooCommerce when a product is created/updated/deleted."""
    db = get_db()
    body = await request.body()

    if not verify_wc_signature(body, request.headers.get("x-wc-webhook-signature", "")):
        return {"error": "Invalid signature"}, 401

    try:
        data = await request.json()
    except Exception:
        return {"status": "ignored", "reason": "invalid json"}

    product_id = data.get("id")
    if not product_id:
        return {"status": "ignored", "reason": "no product id"}

    # Handle delete
    if data.get("status") == "trash" or request.headers.get("x-wc-webhook-topic") == "product.deleted":
        await db.products.delete_one({"woo_id": product_id})
        await db.sync_log.insert_one({
            "type": "webhook", "action": "deleted", "product_id": product_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "deleted", "product_id": product_id}

    # Sync the single product + variations
    success = await sync_single_product(db, product_id)
    await db.sync_log.insert_one({
        "type": "webhook", "action": "updated", "product_id": product_id,
        "success": success, "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "synced" if success else "error", "product_id": product_id}


@app.get(f"{P}/sync-log")
async def get_sync_log(limit: int = Query(20, le=100)):
    """Recent sync activity log."""
    db = get_db()
    logs = await db.sync_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs


@app.get(f"{P}/customers/search")
async def search_customer(request: Request, phone: str = Query("", min_length=3), local_only: bool = Query(False)):
    """Search customers by phone: first local orders (instant), then WooCommerce (slower)."""
    if not phone.strip():
        return []
    rate_limit(request, "customers-search", max_requests=30, window_seconds=60)
    db = get_db()
    results = []
    seen_phones = set()

    # 1. Search local orders first (instant)
    local_orders = await db.orders.find(
        {"customer_phone": {"$regex": phone_regex_prefix(phone)}},
        {"_id": 0, "customer_name": 1, "customer_phone": 1, "customer_address": 1, "customer_city": 1}
    ).sort("created_at", -1).to_list(20)

    for o in local_orders:
        p = o.get("customer_phone", "")
        if p and p not in seen_phones:
            seen_phones.add(p)
            name_parts = (o.get("customer_name", "") or "").split(" ", 1)
            results.append({
                "first_name": name_parts[0] if name_parts else "",
                "last_name": name_parts[1] if len(name_parts) > 1 else "",
                "phone": p,
                "address_1": o.get("customer_address", ""),
                "city": o.get("customer_city", ""),
                "email": o.get("customer_email", ""),
                "source": "local",
            })

    if local_only:
        return results

    # 2. Search WooCommerce orders (may be slow)
    try:
        async with httpx.AsyncClient() as client:
            orders_resp = await client.get(
                f"{WC_URL}/wp-json/wc/v3/orders",
                params={
                    "consumer_key": WC_KEY, "consumer_secret": WC_SECRET,
                    "search": phone.strip(), "per_page": 5, "orderby": "date", "order": "desc",
                },
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=10,
            )
            if orders_resp.status_code == 200:
                for o in orders_resp.json():
                    billing = o.get("billing", {})
                    p = billing.get("phone", "")
                    if p and phone.strip() in p and p not in seen_phones:
                        seen_phones.add(p)
                        results.append({
                            "first_name": billing.get("first_name", ""),
                            "last_name": billing.get("last_name", ""),
                            "phone": p,
                            "email": billing.get("email", ""),
                            "address_1": billing.get("address_1", ""),
                            "city": billing.get("city", ""),
                            "source": "woocommerce",
                        })
    except Exception:
        pass

    return results


# ─── Order Models ───

class OrderItem(BaseModel):
    product_id: int
    variation_id: Optional[int] = None
    name: str
    quantity: int
    price: str
    unit_info: Optional[str] = ""
    item_note: Optional[str] = ""

class CustomerInfo(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    phone: str
    email: Optional[str] = ""
    address_1: Optional[str] = ""
    city: Optional[str] = ""

class CreateOrderRequest(BaseModel):
    customer: CustomerInfo
    items: list[OrderItem]
    payment_method: str = "cod"
    note: Optional[str] = ""
    operator_name: Optional[str] = ""
    sede: Optional[str] = ""
    shipping_method_id: Optional[int] = None
    shipping_title: Optional[str] = ""
    shipping_cost: Optional[float] = 0


# ─── Order Endpoints ───

def _wpp_valid_prices(wpp: dict) -> set:
    """Precios validos por unidad para un producto de peso variable (KG/LB/UND)."""
    try:
        price_per_kg = float(wpp.get("price_per_kg") or 0)
    except (TypeError, ValueError):
        return set()
    try:
        avg_weight_und = float(wpp.get("avg_weight_und") or 0.2)
    except (TypeError, ValueError):
        avg_weight_und = 0.2
    return {
        round(price_per_kg),
        round(price_per_kg * 0.453592),
        round(price_per_kg * avg_weight_und),
    }


async def resolve_authoritative_price(db, product_id: int, variation_id: Optional[int], submitted_price: str) -> str:
    """Verifica el precio enviado por el cliente contra el catalogo (evita manipulacion de precio).
    Si no coincide con el precio real, se usa el precio del catalogo en su lugar.
    Si el producto no esta en cache (caso raro), se confia en el precio enviado."""
    product = await db.products.find_one(
        {"woo_id": product_id},
        {"_id": 0, "price": 1, "regular_price": 1, "variations": 1, "wpp": 1, "categories": 1, "product_type": 1}
    )
    if not product:
        return submitted_price
    strip_meat_promo(product)
    try:
        submitted = float(submitted_price)
    except (TypeError, ValueError):
        submitted = None

    wpp = product.get("wpp")
    if wpp:
        valid_prices = _wpp_valid_prices(wpp)
        if valid_prices and submitted is not None and any(abs(submitted - v) <= 1 for v in valid_prices):
            return submitted_price
        return str(min(valid_prices)) if valid_prices else submitted_price

    if variation_id:
        for v in product.get("variations", []) or []:
            if v.get("variation_id") == variation_id:
                try:
                    real_price = float(v.get("price") or 0)
                except (TypeError, ValueError):
                    return submitted_price
                if submitted is not None and abs(submitted - real_price) <= 1:
                    return submitted_price
                return str(real_price)
        return submitted_price

    try:
        real_price = float(product.get("price") or 0)
    except (TypeError, ValueError):
        return submitted_price
    if submitted is not None and abs(submitted - real_price) <= 1:
        return submitted_price
    return str(real_price)


@app.post(f"{P}/orders/create")
async def create_order(order: CreateOrderRequest, request: Request):
    rate_limit(request, "orders-create", max_requests=20, window_seconds=60)
    db = get_db()
    line_items = []
    verified_items = []
    for item in order.items:
        li = {"product_id": item.product_id, "quantity": item.quantity}
        if item.variation_id:
            li["variation_id"] = item.variation_id
        # Precio verificado contra el catalogo (evita manipulacion de precio desde el cliente)
        verified_price = await resolve_authoritative_price(db, item.product_id, item.variation_id, item.price)
        item_total = str(round(float(verified_price) * item.quantity, 2))
        item_subtotal = item_total
        li["subtotal"] = item_subtotal
        li["total"] = item_total
        meta = []
        if item.unit_info:
            meta.append({"key": "Unidad", "value": item.unit_info})
        if item.item_note:
            meta.append({"key": "Nota", "value": item.item_note})
        if meta:
            li["meta_data"] = meta
        line_items.append(li)
        verified_items.append({**item.dict(), "price": verified_price})

    payment_titles = {"cod": "Contra entrega", "cash": "Efectivo", "transfer": "Transferencia bancaria"}
    operator = order.operator_name or "Operadora"
    is_customer_web = operator == "cliente-web"
    channel = "web-cliente" if is_customer_web else "telefono"
    customer_note_parts = []
    if order.note:
        customer_note_parts.append(order.note)
    # Append per-item notes to customer note for visibility
    item_notes = []
    for item in order.items:
        parts = []
        if item.unit_info:
            parts.append(item.unit_info)
        if item.item_note:
            parts.append(item.item_note)
        if parts:
            item_notes.append(f"- {item.name}: {' | '.join(parts)}")
    if item_notes:
        customer_note_parts.append("Notas por producto:\n" + "\n".join(item_notes))

    sede_display = SEDE_LABELS.get(order.sede, order.sede) if order.sede else ""
    last_name_with_sede = f"{order.customer.last_name} ({sede_display})" if sede_display else order.customer.last_name

    wc_order = {
        "payment_method": order.payment_method,
        "payment_method_title": payment_titles.get(order.payment_method, order.payment_method),
        "set_paid": False, "status": "processing",
        "created_via": channel,
        "billing": {
            "first_name": order.customer.first_name, "last_name": last_name_with_sede,
            "phone": order.customer.phone, "email": order.customer.email or "",
            "address_1": order.customer.address_1,
            "city": order.customer.city,
        },
        "shipping": {
            "first_name": order.customer.first_name, "last_name": last_name_with_sede,
            "address_1": order.customer.address_1, "city": order.customer.city,
        },
        "line_items": line_items,
        "shipping_lines": [{
            "method_id": "flat_rate",
            "method_title": order.shipping_title or "Domicilio",
            "total": str(order.shipping_cost or 0),
        }] if order.shipping_cost and order.shipping_cost > 0 else [],
        "customer_note": "\n".join(customer_note_parts) if customer_note_parts else "",
        "meta_data": [
            {"key": "_canal_pedido", "value": "Web Cliente" if is_customer_web else "Teléfono"},
            {"key": "_operadora", "value": operator},
            {"key": "_pos_order", "value": "yes"},
            {"key": "_sede", "value": order.sede or "Sin sede"},
        ],
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{WC_URL}/wp-json/wc/v3/orders",
            params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET},
            json=wc_order, headers={"User-Agent": "MercaloPOS/1.0"}, timeout=30,
        )
        if resp.status_code in (200, 201):
            wc_data = resp.json()
            wc_order_id = wc_data.get("id")
            # Add internal order note with sede prominently
            sede_display = SEDE_LABELS.get(order.sede, order.sede) if order.sede else ""
            sede_label = f" - Sede: ({sede_display})" if sede_display else ""
            note_text = f"Pedido por WEB CLIENTE{sede_label}" if is_customer_web else f"Pedido por TELÉFONO - Operadora: {operator}{sede_label}"
            await client.post(
                f"{WC_URL}/wp-json/wc/v3/orders/{wc_order_id}/notes",
                params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET},
                json={"note": note_text, "customer_note": False},
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=15,
            )
            order_log = {
                "wc_order_id": wc_order_id,
                "customer_phone": order.customer.phone,
                "customer_email": order.customer.email or "",
                "customer_name": f"{order.customer.first_name} {order.customer.last_name}".strip(),
                "customer_address": order.customer.address_1,
                "customer_city": order.customer.city,
                "items": verified_items,
                "total": wc_data.get("total", "0"),
                "shipping_cost": order.shipping_cost or 0,
                "shipping_title": order.shipping_title or "",
                "payment_method": order.payment_method,
                "operator": operator,
                "channel": channel,
                "sede": order.sede or "",
                "status": "processing",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.orders.insert_one(order_log)
            return {
                "success": True, "order_id": wc_data.get("id"),
                "order_number": wc_data.get("number"), "total": wc_data.get("total"),
                "status": wc_data.get("status"),
            }
        else:
            error_msg = resp.text
            try:
                error_msg = resp.json().get("message", resp.text)
            except Exception:
                pass
            return {"success": False, "error": error_msg, "status_code": resp.status_code}


class LoginRequest(BaseModel):
    pin: str


@app.post(f"{P}/auth/login")
async def login(body: LoginRequest, request: Request):
    """Login con PIN para el panel de pedidos. Devuelve un token de sesion valido por unas horas."""
    rate_limit(request, "auth-login", max_requests=8, window_seconds=300)
    if not ORDERS_PIN:
        raise HTTPException(status_code=400, detail="Login no configurado")
    if not hmac.compare_digest(body.pin.strip(), ORDERS_PIN):
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    return {"token": create_session_token()}


@app.get(f"{P}/orders/recent", dependencies=[Depends(require_session)])
async def recent_orders(
    request: Request,
    limit: int = Query(50, le=200),
    operator: str = Query(None),
    date: str = Query(None),
    phone: str = Query(None),
):
    """Recent orders with optional filters by operator, date (YYYY-MM-DD), phone."""
    rate_limit(request, "orders-recent", max_requests=60, window_seconds=60)
    db = get_db()
    match = {}
    if operator:
        match["operator"] = {"$regex": re.escape(operator), "$options": "i"}
    if phone:
        match["customer_phone"] = {"$regex": phone_regex_prefix(phone)}
    if date:
        match["created_at"] = {"$regex": f"^{re.escape(date)}"}
    orders = await db.orders.find(match, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return orders


@app.get(f"{P}/orders/operators", dependencies=[Depends(require_session)])
async def get_operators():
    """Get distinct operators from order history."""
    db = get_db()
    operators = await db.orders.distinct("operator")
    return [o for o in operators if o]


@app.get(f"{P}/orders/stats", dependencies=[Depends(require_session)])
async def order_stats(date: str = Query(None)):
    """Order stats for a given date (default: today)."""
    db = get_db()
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    match = {"created_at": {"$regex": f"^{date}"}}
    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": "$operator",
            "count": {"$sum": 1},
            "total": {"$sum": {"$toDouble": "$total"}},
        }},
        {"$sort": {"count": -1}},
    ]
    stats = await db.orders.aggregate(pipeline).to_list(50)
    total_orders = sum(s["count"] for s in stats)
    total_revenue = sum(s["total"] for s in stats)
    return {
        "date": date,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "by_operator": [{"operator": s["_id"] or "Sin operadora", "count": s["count"], "total": s["total"]} for s in stats],
    }


# ─── Customer-facing Endpoints ───

@app.get(f"{P}/customer/orders")
async def customer_orders(request: Request, phone: str = Query(..., min_length=3)):
    """Get orders for a customer by phone number, with latest WooCommerce status."""
    rate_limit(request, "customer-orders", max_requests=30, window_seconds=60)
    db = get_db()
    orders = await db.orders.find(
        {"customer_phone": {"$regex": phone_regex_prefix(phone)}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return orders


@app.get(f"{P}/customer/order-status/{{wc_order_id}}")
async def customer_order_status(wc_order_id: int):
    """Get the latest status of an order from WooCommerce."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{WC_URL}/wp-json/wc/v3/orders/{wc_order_id}",
                params={"consumer_key": WC_KEY, "consumer_secret": WC_SECRET},
                headers={"User-Agent": "MercaloPOS/1.0"}, timeout=10,
            )
            if resp.status_code == 200:
                wc = resp.json()
                status = wc.get("status", "unknown")
                # Update local cache
                db = get_db()
                await db.orders.update_one(
                    {"wc_order_id": wc_order_id},
                    {"$set": {"status": status}}
                )
                return {"order_id": wc_order_id, "status": status, "total": wc.get("total")}
    except Exception:
        pass
    # Fallback to local
    db = get_db()
    local = await db.orders.find_one({"wc_order_id": wc_order_id}, {"_id": 0, "status": 1, "total": 1})
    return {"order_id": wc_order_id, "status": local.get("status", "unknown") if local else "unknown"}


@app.get(f"{P}/customer/favorites")
async def customer_favorites(request: Request, phone: str = Query(..., min_length=3), limit: int = Query(10, le=20)):
    """Get favorite products from local orders, fallback to WooCommerce history."""
    rate_limit(request, "customer-favorites", max_requests=30, window_seconds=60)
    db = get_db()
    pipeline = [
        {"$match": {"customer_phone": {"$regex": phone_regex_prefix(phone)}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "name": {"$first": "$items.name"},
            "count": {"$sum": "$items.quantity"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    favorites = await db.orders.aggregate(pipeline).to_list(limit)

    # Fallback: search WooCommerce order history by phone
    if not favorites:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{WC_URL}/wp-json/wc/v3/orders",
                    params={
                        "consumer_key": WC_KEY, "consumer_secret": WC_SECRET,
                        "search": phone.strip(), "per_page": 10,
                        "orderby": "date", "order": "desc", "status": "any",
                    },
                    headers={"User-Agent": "MercaloPOS/1.0"}, timeout=15,
                )
                if resp.status_code == 200:
                    freq = {}
                    for order in resp.json():
                        billing_phone = order.get("billing", {}).get("phone", "")
                        if phone.strip() not in billing_phone:
                            continue
                        for item in order.get("line_items", []):
                            pid = item.get("product_id")
                            if pid:
                                freq[pid] = freq.get(pid, 0) + item.get("quantity", 1)
                    favorites = [
                        {"_id": pid, "count": cnt}
                        for pid, cnt in sorted(freq.items(), key=lambda x: -x[1])[:limit]
                    ]
        except Exception:
            pass

    if not favorites:
        return []

    product_ids = [f["_id"] for f in favorites]
    products = await db.products.find(
        {"woo_id": {"$in": product_ids}},
        {"_id": 0, "woo_id": 1, "name": 1, "price": 1, "regular_price": 1, "categories": 1, "variations": 1,
         "image_url": 1, "product_type": 1, "stock_quantity": 1}
    ).to_list(limit)
    product_map = {p["woo_id"]: strip_meat_promo(p) for p in products}
    for p in product_map.values():
        for extra in ("regular_price", "categories", "variations"):
            p.pop(extra, None)
    result = []
    for f in favorites:
        prod = product_map.get(f["_id"])
        if prod:
            result.append({**prod, "times_purchased": f["count"]})
    return result


# ─── Servir Frontend React ───

FRONTEND_BUILD = os.path.join(os.path.dirname(__file__), "..", "frontend", "build")

if os.path.exists(FRONTEND_BUILD):
    app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_BUILD, "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index = os.path.join(FRONTEND_BUILD, "index.html")
        return FileResponse(index)


SEDE_LABELS = {"señorial": "Señorial", "la_paz": "La Paz"}
STATUS_LABELS = {
    "pending": "Pendiente", "on-hold": "En espera", "processing": "Procesando",
    "completed": "Completado", "cancelled": "Cancelado", "shipped": "En camino",
    "out-for-delivery": "En camino",
}


@app.post(f"{P}/webhook/order-updated")
async def webhook_order_updated(request: Request):
    """Webhook from WooCommerce when order status changes."""
    body = await request.body()
    if not verify_wc_signature(body, request.headers.get("x-wc-webhook-signature", "")):
        return {"error": "Invalid signature"}, 401
    try:
        data = await request.json()
        wc_id = data.get("id")
        new_status = data.get("status", "")
        if not wc_id:
            return {"ok": False}
        db = get_db()
        local = await db.orders.find_one({"wc_order_id": wc_id}, {"_id": 0})
        if local:
            old_status = local.get("status", "")
            if old_status != new_status:
                await db.orders.update_one(
                    {"wc_order_id": wc_id},
                    {"$set": {"status": new_status, "status_updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                # Store notification for POS
                await db.notifications.insert_one({
                    "wc_order_id": wc_id,
                    "customer_phone": local.get("customer_phone", ""),
                    "customer_name": local.get("customer_name", ""),
                    "sede": local.get("sede", ""),
                    "old_status": old_status,
                    "new_status": new_status,
                    "seen": False,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        return {"ok": True, "order_id": wc_id, "status": new_status}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get(f"{P}/notifications", dependencies=[Depends(require_session)])
async def get_notifications(limit: int = Query(20)):
    """Get unseen notifications for POS operators."""
    db = get_db()
    notifs = await db.notifications.find(
        {"seen": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return notifs


@app.post(f"{P}/notifications/mark-seen", dependencies=[Depends(require_session)])
async def mark_notifications_seen():
    """Mark all notifications as seen."""
    db = get_db()
    await db.notifications.update_many({"seen": False}, {"$set": {"seen": True}})
    return {"ok": True}


@app.get(f"{P}/orders/whatsapp-link/{{wc_order_id}}", dependencies=[Depends(require_session)])
async def generate_whatsapp_link(wc_order_id: int):
    """Generate a WhatsApp link to notify customer about order status change."""
    db = get_db()
    order = await db.orders.find_one({"wc_order_id": wc_order_id}, {"_id": 0})
    if not order:
        return {"error": "Pedido no encontrado"}
    phone = order.get("customer_phone", "").replace(" ", "").replace("-", "")
    name = order.get("customer_name", "Cliente")
    status = order.get("status", "processing")
    sede = SEDE_LABELS.get(order.get("sede", ""), "")
    sede_text = f" ({sede})" if sede else ""
    total = order.get("total", "0")
    status_label = STATUS_LABELS.get(status, status)
    items_text = ""
    for item in (order.get("items") or [])[:5]:
        items_text += f"\n- {item.get('name', '')} x{item.get('quantity', 1)}"
    msg = f"*Pedido #{wc_order_id}{sede_text}*\n\nHola {name}!\n\nTu pedido está: *{status_label}* ✅\n{items_text}\n\n*Total: ${int(float(total)):,}*".replace(",", ".")
    if status in ("completed",):
        msg += "\n\n¡Tu pedido está listo! Gracias por tu compra."
    elif status in ("shipped", "out-for-delivery"):
        msg += "\n\n¡Tu pedido va en camino!"
    wa_url = f"https://wa.me/57{phone}?text={quote(msg)}"
    return {"whatsapp_url": wa_url, "message": msg, "phone": phone, "status": status_label}
