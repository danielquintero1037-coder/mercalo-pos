import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Heart, Plus, Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function Favorites({ phone, addToCart, cart = [] }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const favRef = useRef(null);

  const cartQtyMap = useMemo(() => {
    const map = {};
    cart.forEach(item => {
      map[item.woo_id] = (map[item.woo_id] || 0) + item.qty;
    });
    return map;
  }, [cart]);

  const loadFavorites = useCallback(async () => {
    if (!phone || phone.length < 7) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/customer/favorites?phone=${encodeURIComponent(phone)}&limit=20`);
      const data = await r.json();
      setProducts(data);
    } catch {
      setProducts([]);
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleAdd = useCallback((product) => {
    addToCart(product);
    setToast(product.name);
    setTimeout(() => setToast(null), 1500);
  }, [addToCart]);

  const formatPrice = (price) => `$${parseInt(price || '0').toLocaleString('es-CO')}`;

  if (!phone || phone.length < 7) return null;

  return (
    <div className="px-2 md:px-4 py-1 md:py-2 relative" data-testid="favorites-section">
      <div className="flex items-center gap-1.5 mb-1">
        <Heart className="w-3 md:w-4 h-3 md:h-4 text-red-500 fill-red-500" />
        <h2 className="text-[10px] md:text-sm font-bold text-gray-800 uppercase tracking-wide">Tus Favoritos</h2>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
          <span>Buscando tus compras anteriores...</span>
        </div>
      ) : products.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">Aún no tienes compras con este número. ¡Haz tu primer pedido!</p>
      ) : (
        <div className="relative group/fav">
        <button onClick={() => { const el = favRef.current; if(el) el.scrollBy({left: -200, behavior: 'smooth'}); }}
          className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-white to-transparent items-center justify-center opacity-0 group-hover/fav:opacity-100 transition-opacity">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div ref={favRef} className="flex gap-1.5 md:gap-2 overflow-x-auto no-scrollbar pb-1 scroll-smooth" data-testid="favorites-list">
          {products.map(product => {
            const qty = cartQtyMap[product.woo_id] || 0;
            return (
              <button
                key={product.woo_id}
                onClick={() => handleAdd(product)}
                className={`group shrink-0 bg-white rounded-lg border transition-all text-left relative flex md:flex-col items-center md:items-stretch gap-1.5 md:gap-0 p-1 md:p-1.5 md:w-28 w-auto ${
                  qty > 0 ? 'border-green-400 ring-1 ring-green-200' : 'border-red-100 hover:border-red-400 hover:shadow-md'
                }`}
                data-testid={`favorite-${product.woo_id}`}
              >
                <div className="relative w-10 h-10 md:w-auto md:h-auto md:aspect-square rounded overflow-hidden bg-gray-50 shrink-0 md:mb-1">
                  <img
                    src={product.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23f3f4f6" width="80" height="80"/></svg>'}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {qty > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
                      {qty}
                    </span>
                  )}
                </div>
                <div className="min-w-0 pr-1 md:pr-0">
                  <p className="text-[10px] md:text-xs font-medium text-gray-800 leading-tight truncate md:line-clamp-2 md:h-7 max-w-[80px] md:max-w-none">{product.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <p className="text-[10px] md:text-xs font-bold text-red-500">{formatPrice(product.price)}</p>
                    <span className="text-[8px] text-gray-400 font-medium">x{product.times_purchased}</span>
                  </div>
                </div>
                {qty > 0 && (
                  <span className="hidden md:flex absolute top-0.5 right-0.5 bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />{qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button onClick={() => { const el = favRef.current; if(el) el.scrollBy({left: 200, behavior: 'smooth'}); }}
          className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-white to-transparent items-center justify-center opacity-0 group-hover/fav:opacity-100 transition-opacity">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">{toast} agregado</span>
        </div>
      )}
    </div>
  );
}
