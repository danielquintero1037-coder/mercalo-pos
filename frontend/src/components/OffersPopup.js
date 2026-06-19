import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Tag, Plus, Minus, Check } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function OffersPopup({ onViewAll, addToCart, cart = [], onUpdateQty }) {
  const [offers, setOffers] = useState([]);
  const [visible, setVisible] = useState(false);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (sessionStorage.getItem('offers_popup_seen')) return;
    fetch(`${API}/api/products/offers?limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data && data.length > 0) {
          setTotal(data.length);
          setOffers(data);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const cartQtyMap = useMemo(() => {
    const map = {};
    cart.forEach(item => {
      map[item.woo_id] = (map[item.woo_id] || 0) + item.qty;
    });
    return map;
  }, [cart]);

  const showToast = useCallback((name) => {
    setToast(name);
    setTimeout(() => setToast(null), 1500);
  }, []);

  const handleAdd = useCallback((product) => {
    if (addToCart) {
      addToCart(product);
      showToast(product.name);
    }
  }, [addToCart, showToast]);

  const handleDecrement = useCallback((product) => {
    const cartKey = String(product.woo_id);
    if (onUpdateQty) onUpdateQty(cartKey, -1);
  }, [onUpdateQty]);

  const close = () => {
    setVisible(false);
    sessionStorage.setItem('offers_popup_seen', '1');
  };

  const handleViewAll = () => {
    close();
    onViewAll();
  };

  const calcDiscount = (regular, sale) => {
    const r = parseInt(regular || '0');
    const s = parseInt(sale || '0');
    if (r > 0 && s > 0) return Math.round((1 - s / r) * 100);
    return 0;
  };

  const fmt = p => `$${parseInt(p || '0').toLocaleString('es-CO')}`;

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={close}>
      <div
        className="bg-white w-full sm:w-[420px] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-orange-500 px-4 py-3 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            <span className="font-bold text-base">¡Ofertas de hoy!</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{total} productos</span>
          </div>
          <button onClick={close} className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Products grid */}
        <div className="p-3 grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
          {offers.map(p => {
            const disc = calcDiscount(p.regular_price, p.sale_price);
            const qty = cartQtyMap[p.woo_id] || 0;
            return (
              <div key={p.woo_id} className="rounded-xl border border-orange-100 overflow-hidden bg-orange-50">
                <div className="relative aspect-square bg-gray-100">
                  <img
                    src={p.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23f3f4f6" width="80" height="80"/></svg>'}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {disc > 0 && (
                    <span className="absolute top-1.5 left-1.5 bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow">
                      -{disc}%
                    </span>
                  )}
                  {qty > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-brand-red text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
                      {qty}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-700 font-medium leading-tight line-clamp-2">{p.name}</p>
                  <div className="mt-1 flex flex-col">
                    <span className="text-[11px] text-gray-400 line-through">{fmt(p.regular_price)}</span>
                    <span className="text-sm font-bold text-orange-600">{fmt(p.sale_price || p.price)}</span>
                  </div>
                  {/* Stepper / Add button */}
                  <div className="mt-1.5">
                    {qty > 0 ? (
                      <div className="flex items-center justify-between">
                        <button onClick={() => handleDecrement(p)}
                          className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
                          <Minus className="w-3.5 h-3.5 text-gray-700" />
                        </button>
                        <span className="text-sm font-bold text-gray-900">{qty}</span>
                        <button onClick={() => handleAdd(p)}
                          className="w-7 h-7 rounded-full bg-brand-red hover:bg-red-700 flex items-center justify-center text-white">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleAdd(p)}
                        className="w-full py-1.5 bg-brand-red hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Agregar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-3 pb-4 flex gap-2">
          <button
            onClick={handleViewAll}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
          >
            Ver todas las ofertas ({total})
          </button>
          <button
            onClick={close}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

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
