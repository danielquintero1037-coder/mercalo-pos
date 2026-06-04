import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Plus, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function Favorites({ phone, addToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    if (!phone || phone.length < 7) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/customer/favorites?phone=${encodeURIComponent(phone)}&limit=10`);
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

  const formatPrice = (price) => `$${parseInt(price || '0').toLocaleString('es-CO')}`;

  if (!phone || phone.length < 7) return null;

  return (
    <div className="px-2 md:px-4 py-1 md:py-2" data-testid="favorites-section">
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
        <div className="flex gap-1.5 md:gap-2 overflow-x-auto no-scrollbar pb-1" data-testid="favorites-list">
          {products.map(product => (
            <button
              key={product.woo_id}
              onClick={() => addToCart(product)}
              className="group shrink-0 bg-white rounded-lg border border-red-100 hover:border-red-400 hover:shadow-md transition-all text-left relative flex md:flex-col items-center md:items-stretch gap-1.5 md:gap-0 p-1 md:p-1.5 md:w-28 w-auto"
              data-testid={`favorite-${product.woo_id}`}
            >
              <div className="relative w-10 h-10 md:w-auto md:h-auto md:aspect-square rounded overflow-hidden bg-gray-50 shrink-0 md:mb-1">
                <img
                  src={product.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23f3f4f6" width="80" height="80"/></svg>'}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 pr-1 md:pr-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-800 leading-tight truncate md:line-clamp-2 md:h-7 max-w-[80px] md:max-w-none">{product.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-[10px] md:text-xs font-bold text-red-500">{formatPrice(product.price)}</p>
                  <span className="text-[8px] text-gray-400 font-medium">x{product.times_purchased}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
