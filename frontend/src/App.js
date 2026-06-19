import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardList, ShoppingCart, Share2, Package, Phone, Tag } from 'lucide-react';
import SearchBar from './components/SearchBar';
import TopSellers from './components/TopSellers';
import Cart from './components/Cart';
import SyncBanner from './components/SyncBanner';
import VariationModal from './components/VariationModal';
import OrdersPanel from './components/OrdersPanel';
import MyOrders from './components/MyOrders';
import Favorites from './components/Favorites';
import RecentOrders from './components/RecentOrders';
import OffersPanel from './components/OffersPanel';
import OffersPopup from './components/OffersPopup';
import { NotificationBell } from './components/NotificationsPanel';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function App() {
  const isCustomerMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('tienda') || params.get('mode') === 'tienda';
  }, []);

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('mercalo-cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('mercalo-cart', JSON.stringify(cart)); } catch {}
  }, [cart]);
  const [syncStatus, setSyncStatus] = useState({ total: 0, syncing: false, syncInterval: 10 });
  const [categories, setCategories] = useState([]);
  const [variationProduct, setVariationProduct] = useState(null);
  const [showOrders, setShowOrders] = useState(false);
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');

  useEffect(() => {
    fetch(`${API}/api/products/sync-status`)
      .then(r => r.json())
      .then(d => setSyncStatus(prev => ({ ...prev, total: d.total_in_cache, syncInterval: d.sync_interval_minutes || 10 })))
      .catch(() => {});
    fetch(`${API}/api/categories`)
      .then(r => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncStatus(prev => ({ ...prev, syncing: true }));
    try {
      const r = await fetch(`${API}/api/products/sync`);
      const d = await r.json();
      await fetch(`${API}/api/products/sync-variations`);
      setSyncStatus({ total: d.total_in_cache, syncing: false, syncInterval: syncStatus.syncInterval });
      const catR = await fetch(`${API}/api/categories`);
      setCategories(await catR.json());
    } catch {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  }, [syncStatus.syncInterval]);

  const addToCart = useCallback((product) => {
    if (product.product_type === 'variable' || product.wpp || (product.attributes && product.attributes.length > 0)) {
      setVariationProduct(product);
      return;
    }
    setCart(prev => {
      const key = product.variation_id ? `${product.woo_id}-${product.variation_id}` : String(product.woo_id);
      const idx = prev.findIndex(item => item._cartKey === key);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      }
      return [...prev, { ...product, qty: product.qty || 1, _cartKey: key }];
    });
  }, []);

  // Force add to cart (skips variation modal) - used for reorder
  const addDirectToCart = useCallback((product) => {
    setCart(prev => {
      const key = product.variation_id ? `${product.woo_id}-${product.variation_id}` : String(product.woo_id);
      const idx = prev.findIndex(item => item._cartKey === key);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + (product.qty || 1) };
        return updated;
      }
      return [...prev, { ...product, qty: product.qty || 1, _cartKey: key }];
    });
  }, []);

  const addVariationToCart = useCallback((product) => {
    setCart(prev => {
      const key = product.variation_id ? `${product.woo_id}-${product.variation_id}` : String(product.woo_id);
      const idx = prev.findIndex(item => item._cartKey === key);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + (product.qty || 1) };
        return updated;
      }
      return [...prev, { ...product, _cartKey: key }];
    });
  }, []);

  const updateQty = useCallback((cartKey, delta) => {
    setCart(prev => prev.map(item => item._cartKey === cartKey ? { ...item, qty: item.qty + delta } : item).filter(item => item.qty > 0));
  }, []);

  const removeItem = useCallback((cartKey) => {
    setCart(prev => prev.filter(item => item._cartKey !== cartKey));
  }, []);

  const updateItemNote = useCallback((cartKey, note) => {
    setCart(prev => prev.map(item => item._cartKey === cartKey ? { ...item, item_note: note } : item));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = cart.reduce((sum, item) => sum + parseInt(item.price || '0') * item.qty, 0);

  const shareLink = `${window.location.origin}/?tienda`;

  return (
    <div className="h-screen flex flex-col" data-testid="pos-app">
      {/* Header */}
      <header className="bg-brand-red text-white px-3 md:px-4 py-2 flex items-center justify-between shrink-0 safe-top" data-testid="pos-header">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <h1 className="text-base md:text-lg font-bold tracking-tight whitespace-nowrap">
            {isCustomerMode ? 'MERCALO' : 'MERCALO POS'}
          </h1>
          {isCustomerMode ? (
            <span className="text-[10px] md:text-xs opacity-90 hidden sm:inline">Haz tu pedido</span>
          ) : (
            <span className="text-[10px] md:text-xs opacity-75 hidden sm:inline">{syncStatus.total} productos</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          {isCustomerMode ? (
            <>
              <button onClick={() => setShowOffers(true)}
                className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-orange-400 hover:bg-orange-300 transition-colors text-xs font-bold"
                data-testid="offers-btn">
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ofertas</span>
              </button>
              <button onClick={() => setShowMyOrders(true)}
                className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium"
                data-testid="my-orders-btn">
                <Package className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mis Pedidos</span>
              </button>
              <button onClick={() => { navigator.clipboard?.writeText(shareLink); alert('Link copiado!'); }}
                className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium"
                data-testid="share-btn">
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compartir</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setShowOffers(true)}
                className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-orange-400 hover:bg-orange-300 transition-colors text-xs font-bold"
                data-testid="offers-btn">
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ofertas</span>
              </button>
              <NotificationBell />
              <button onClick={() => setShowOrders(true)}
                className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium"
                data-testid="orders-btn">
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pedidos</span>
              </button>
              <SyncBanner syncing={syncStatus.syncing} onSync={triggerSync} total={syncStatus.total} syncInterval={syncStatus.syncInterval} />
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          {isCustomerMode && (
            <div className="px-2 md:px-4 pt-2 pb-1 shrink-0" data-testid="customer-phone-bar">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="Ingresa tu teléfono para ver tus favoritos..."
                  className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-red transition-colors"
                  data-testid="customer-phone-input"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <SearchBar addToCart={addToCart} cart={cart} onUpdateQty={updateQty} />
          <TopSellers addToCart={addToCart} categories={categories}>
            {isCustomerMode && <Favorites phone={customerPhone} addToCart={addToCart} />}
          </TopSellers>
        </div>

        {/* Desktop cart (hidden on mobile) */}
        <div className="hidden md:flex">
          <Cart items={cart} updateQty={updateQty} removeItem={removeItem} clearCart={clearCart} updateItemNote={updateItemNote}
            isCustomerMode={isCustomerMode} onCustomerPhone={setCustomerPhone} customerPhone={customerPhone} />
        </div>

        {/* Mobile cart overlay */}
        {mobileCartOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileCartOpen(false)} data-testid="mobile-cart-overlay">
            <div className="absolute inset-y-0 right-0 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <Cart items={cart} updateQty={updateQty} removeItem={removeItem} clearCart={clearCart} updateItemNote={updateItemNote}
                onClose={() => setMobileCartOpen(false)} isMobile isCustomerMode={isCustomerMode} onCustomerPhone={setCustomerPhone} customerPhone={customerPhone} />
            </div>
          </div>
        )}

        {/* Mobile floating cart button */}
        {!mobileCartOpen && (
          <button
            onClick={() => setMobileCartOpen(true)}
            className="md:hidden fixed bottom-4 right-4 z-30 bg-brand-red text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            data-testid="mobile-cart-fab"
          >
            <ShoppingCart className="w-6 h-6" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-brand-red text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow" data-testid="mobile-cart-count">
                {totalItems}
              </span>
            )}
            {totalItems > 0 && (
              <span className="absolute -bottom-5 right-0 left-0 text-center text-[10px] font-bold bg-white text-brand-red rounded-full px-1 py-0.5 shadow-sm">
                ${totalPrice.toLocaleString('es-CO')}
              </span>
            )}
          </button>
        )}
      </div>

      {variationProduct && (
        <VariationModal product={variationProduct} onAdd={addVariationToCart} onClose={() => setVariationProduct(null)} />
      )}
      {showOrders && !isCustomerMode && <OrdersPanel onClose={() => setShowOrders(false)} />}
      {showMyOrders && isCustomerMode && <MyOrders onClose={() => setShowMyOrders(false)} addToCart={addDirectToCart} customerPhone={customerPhone} />}
      {showOffers && <OffersPanel onClose={() => setShowOffers(false)} addToCart={addToCart} cart={cart} onUpdateQty={updateQty} />}
      {isCustomerMode && <OffersPopup onViewAll={() => setShowOffers(true)} addToCart={addToCart} cart={cart} onUpdateQty={updateQty} />}
    </div>
  );
}
