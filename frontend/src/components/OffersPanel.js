import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Tag, Plus, Minus, Loader2, ArrowLeft, Check } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function OffersPanel({ onClose, addToCart, cart = [], onUpdateQty }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/products/offers?limit=50`)
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false); })
      .catch(() => setLoading(false));
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
    addToCart(product);
    showToast(product.name);
  }, [addToCart, showToast]);

  const handleDecrement = useCallback((product) => {
    const cartKey = String(product.woo_id);
    if (onUpdateQty) onUpdateQty(cartKey, -1);
  }, [onUpdateQty]);

  const formatPrice = (price) => `$${parseInt(price || '0').toLocaleString('es-CO')}`;

  const calcDiscount = (regular, sale) => {
    const r = parseInt(regular || '0');
    const s = parseInt(sale || '0');
    if (r > 0 && s > 0) return Math.round((1 - s / r) * 100);
    return 0;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 md:p-4" onClick={onClose} data-testid="offers-panel">
      <div className="bg-white md:rounded-xl shadow-2xl w-full h-full md:w-[700px] md:max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-orange-500 text-white md:rounded-t-xl">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center" data-testid="back-offers">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Tag className="w-5 h-5" />
            <h2 className="font-bold text-base">Ofertas</h2>
            <span className="text-xs opacity-80">{products.length} productos en oferta</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center hidden md:flex" data-testid="close-offers">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-3" data-testid="offers-list">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Tag className="w-10 h-10 mb-2" />
              <p className="text-sm">No hay ofertas en este momento</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {products.map(product => {
                const discount = calcDiscount(product.regular_price, product.sale_price);
                const qty = cartQtyMap[product.woo_id] || 0;
                return (
                  <div
                    key={product.woo_id}
                    className="group bg-white rounded-lg border border-orange-200 p-2 hover:shadow-lg hover:border-orange-400 transition-all text-left relative"
                    data-testid={`offer-${product.woo_id}`}
                  >
                    <div className="relative aspect-square rounded overflow-hidden bg-gray-50 mb-1.5">
                      <img
                        src={product.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23f3f4f6" width="80" height="80"/></svg>'}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow" data-testid={`offer-badge-${product.woo_id}`}>
                        -{discount}%
                      </span>
                      {qty > 0 && (
                        <span className="absolute top-1 right-1 bg-brand-red text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
                          {qty}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2 h-8">{product.name}</p>
                    <div className="mt-1">
                      <span className="text-[10px] text-gray-400 line-through">{formatPrice(product.regular_price)}</span>
                      <span className="text-sm font-bold text-orange-600 ml-1">{formatPrice(product.sale_price || product.price)}</span>
                    </div>
                    {/* Stepper / Add button */}
                    <div className="mt-1.5">
                      {qty > 0 ? (
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => handleDecrement(product)}
                            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5 text-gray-700" />
                          </button>
                          <span className="text-sm font-bold text-gray-900">{qty}</span>
                          <button
                            onClick={() => handleAdd(product)}
                            className="w-8 h-8 rounded-full bg-brand-red hover:bg-red-700 flex items-center justify-center text-white"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAdd(product)}
                          className="w-full py-1.5 bg-brand-red hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-bounce-in">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">{toast} agregado</span>
        </div>
      )}
    </div>
  );
}
