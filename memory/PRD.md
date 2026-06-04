# Mercalo POS - Product Requirements Document

## Problem Statement
Build a high-performance, professional POS / Call Center interface for the WooCommerce store `mercalo.co`. Standalone web app with two modes: POS for operators and Customer-facing for WhatsApp.

## Stack
- **Frontend**: React (CRA), TailwindCSS, Lucide icons
- **Backend**: FastAPI (Python), Motor (async MongoDB)
- **Database**: MongoDB (via MONGO_URL)
- **External**: WooCommerce REST API

## Two Modes
1. **POS Mode** (`/`) - Red theme, operator field, customer phone search, orders panel, sync controls
2. **Customer Mode** (`/?tienda`) - Green theme, no operator field, favorites, order tracking, WhatsApp sharing

## All Implemented Features
### Core POS
- Ultra-fast product search (debounced, regex-based)
- 17 parent categories with horizontal scroll bar, subcategory products included via recursive lookup
- Product count badge next to each category name
- "Cargar más" pagination button (loads 50 more products per click)
- Variable product support (ESTADO, PESO selectors)
- Weight-based pricing calculator (UND/LB/KG)
- Dynamic cart with quantity controls + per-item notes
- Unit info badge (UND/LB/KG) in cart items
- Phone-first checkout with instant customer auto-fill
- WooCommerce order creation with operator/channel tagging
- Local product cache with automatic sync (webhook + 10min periodic)
- Recent orders dashboard with filters, stats, and status badges
- PWA installable on any device
- Fully responsive (mobile/tablet/desktop)

### Multi-Sede (Señorial / La Paz)
- Sede selector in checkout form (both modes)
- Orders tagged with sede in WooCommerce meta_data
- Sede shown in parentheses: #73688 (La Paz), #73687 (Señorial)
- Sede visible in POS orders panel, customer "Mis Pedidos", and WooCommerce notes

### WhatsApp Notifications
- Auto-open WhatsApp confirmation (wa.me link) immediately after order creation
- WhatsApp goes to STORE number based on sede: Señorial (3185309822) or La Paz (3178774108)
- Message includes: customer name, phone, address, items, shipping, total, payment method
- Confirmation button still visible in checkout result if user misses the popup
- "Notificar por WhatsApp" button in POS orders panel for each order
- Notification bell ("Alertas") in POS header with real-time polling (every 15s)
- When WooCommerce order status changes via webhook, notification appears with WhatsApp "Notificar" button
- Status change shown: old status → new status (e.g., Procesando → Completado)
- "Marcar leídas" to clear all notifications

### Customer Features
- Order tracking: "Mis Pedidos" panel with phone search and 3-step status tracker
- Status refresh from WooCommerce in real-time
- Personalized favorites based on purchase history
- Share link for WhatsApp distribution

### Shipping / Domicilio
- Shipping zones synced from WooCommerce (auto-updated with background sync)
- Zone selector in checkout: Señorial/Trianón/Dorado/La Paz ($3,800), Envigado/Sabaneta/Itagüí ($4,500), El Poblado ($7,500)
- "Recoge en tienda" option ($0)
- Free shipping for orders over $200,000
- Shipping cost sent to WooCommerce as shipping_line in order
- Subtotal + Domicilio breakdown in cart footer
- Works in both POS and Customer (?tienda) modes
- Price override: line items sent with explicit subtotal/total to prevent WooCommerce price mismatch
- POST /api/webhook/order-updated - receives WooCommerce status change webhooks
- Stores notifications for POS operators
- Updates local order status

## Key API Endpoints
- `GET /api/products/search?q=` - Product search
- `GET /api/products/top-sellers?limit=50&category_id=`
- `GET /api/categories` - All categories
- `GET /api/customers/search?phone=&local_only=`
- `POST /api/orders/create` - Create order (with sede, unit_info, item_note)
- `GET /api/customer/orders?phone=` - Customer order history
- `GET /api/customer/order-status/{id}` - Live status from WooCommerce
- `GET /api/customer/favorites?phone=` - Personalized favorites
- `GET /api/orders/recent` - POS orders panel
- `GET /api/orders/whatsapp-link/{id}` - Generate WhatsApp notification link
- `GET /api/notifications` - Unseen status change notifications
- `POST /api/webhook/order-updated` - WooCommerce order status webhook

## URLs
- **POS**: `https://mercalo-pos.preview.emergentagent.com/`
- **Tienda**: `https://mercalo-pos.preview.emergentagent.com/?tienda`

## Testing
- iteration_1: Core features 100%
- iteration_2: PWA + responsive 100%
- iteration_3: All categories + customer mode 100%
- iteration_4: Sedes + tracking + favorites 100%
- Feb 2026: Fixed parent category → subcategory product mapping (P0 blocker resolved)

## Backlog
- Auto WhatsApp via Twilio/Meta API (currently uses wa.me link)
- Duplicate previous order with one click
- Refactor server.py into modular structure
