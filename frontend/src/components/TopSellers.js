import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, ChevronDown } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function TopSellers({ addToCart, categories, children }) {
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const PAGE_SIZE = 50;

  const loadTopSellers = useCallback(async (catId, offset = 0) => {
    const isLoadMore = offset > 0;
    if (isLoadMore) setLoadingMore(true); else setLoading(true);
    try {
      let url = `${API}/api/products/top-sellers?limit=${PAGE_SIZE}&offset=${offset}`;
      if (catId) url += `&category_id=${catId}`;
      const r = await fetch(url);
      const data = await r.json();
      // Sort: promotions first, then by total_sales
      data.sort((a, b) => {
        const aPromo = a.sale_price && a.regular_price && parseInt(a.sale_price) < parseInt(a.regular_price) ? 1 : 0;
        const bPromo = b.sale_price && b.regular_price && parseInt(b.sale_price) < parseInt(b.regular_price) ? 1 : 0;
        return bPromo - aPromo;
      });
      setProducts(prev => {
        if (!isLoadMore) return data;
        const existing = new Set(prev.map(p => p.woo_id));
        return [...prev, ...data.filter(p => !existing.has(p.woo_id))];
      });
      setHasMore(data.length >= PAGE_SIZE);
    } catch {
      if (!isLoadMore) setProducts([]);
    }
    if (isLoadMore) setLoadingMore(false); else setLoading(false);
  }, []);

  useEffect(() => {
    loadTopSellers(selectedCat);
  }, [selectedCat, loadTopSellers]);

  const formatPrice = (price) => {
    const num = parseInt(price || '0');
    return `$${num.toLocaleString('es-CO')}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-2 md:px-4 pb-2" data-testid="top-sellers">
      {/* Header */}
      <div className="flex items-center gap-1.5 py-2 shrink-0">
        <TrendingUp className="w-4 h-4 text-brand-red" />
        <h2 className="text-xs md:text-sm font-bold text-gray-800 uppercase tracking-wide">Top Vendidos</h2>
      </div>
      {/* Category filter - horizontal scroll with arrows */}
      <div className="relative shrink-0 group/cats" data-testid="category-filter-wrapper">
        <button onClick={() => { const el = document.getElementById('cat-scroll'); if(el) el.scrollBy({left: -200, behavior: 'smooth'}); }}
          className="absolute left-0 top-0 bottom-0 z-10 w-7 bg-gradient-to-r from-white to-transparent flex items-center justify-center opacity-0 group-hover/cats:opacity-100 transition-opacity"
          data-testid="cat-scroll-left">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div id="cat-scroll" className="flex overflow-x-auto gap-1.5 pb-2 no-scrollbar scroll-smooth" data-testid="category-filter">
        <button
          onClick={() => setSelectedCat(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            !selectedCat ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          data-testid="cat-all"
        >
          Todos
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCat === cat.id ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            data-testid={`cat-${cat.id}`}
          >
            {cat.name} <span className={`text-[10px] ${selectedCat === cat.id ? 'opacity-75' : 'text-gray-400'}`}>({cat.count || 0})</span>
          </button>
        ))}
        </div>
        <button onClick={() => { const el = document.getElementById('cat-scroll'); if(el) el.scrollBy({left: 200, behavior: 'smooth'}); }}
          className="absolute right-0 top-0 bottom-0 z-10 w-7 bg-gradient-to-l from-white to-transparent flex items-center justify-center opacity-0 group-hover/cats:opacity-100 transition-opacity"
          data-testid="cat-scroll-right">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto" data-testid="top-sellers-grid">
        {children}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No hay productos. Sincroniza el catálogo primero.
          </div>
        ) : (
          <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 md:gap-2">
            {products.map(product => {
              const hasPromo = product.sale_price && product.regular_price && parseInt(product.sale_price) < parseInt(product.regular_price);
              return (
              <button
                key={product.woo_id}
                onClick={() => addToCart(product)}
                className={`group bg-white rounded-lg border p-1.5 hover:shadow-md transition-all text-left relative ${hasPromo ? 'border-orange-300 ring-1 ring-orange-200' : 'border-gray-100 hover:border-brand-red'}`}
                data-testid={`top-seller-${product.woo_id}`}
              >
                <div className="relative aspect-square rounded overflow-hidden bg-gray-50 mb-1">
                  <img
                    src={product.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23f3f4f6" width="80" height="80"/><text x="50%" y="50%" fill="%239ca3af" font-size="10" text-anchor="middle" dominant-baseline="middle">Sin img</text></svg>'}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-brand-red/0 group-hover:bg-brand-red/10 transition-colors flex items-center justify-center">
                    <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                  </div>
                  {hasPromo && (
                    <span className="absolute top-0.5 left-0.5 bg-orange-500 text-white text-[8px] md:text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm" data-testid={`promo-badge-${product.woo_id}`}>
                      {product.short_description?.startsWith('Lleva') ? product.short_description : 'OFERTA'}
                    </span>
                  )}
                  {product.product_type === 'variable' && (
                    <span className="absolute top-0.5 right-0.5 bg-amber-500 text-white text-[9px] font-bold px-1 rounded">VAR</span>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2 h-8">{product.name}</p>
                {hasPromo ? (
                  <div className="mt-0.5">
                    <span className="text-[10px] text-gray-400 line-through">{formatPrice(product.regular_price)}</span>
                    <span className="text-xs font-bold text-orange-600 ml-1">{formatPrice(product.sale_price || product.price)}</span>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-brand-red mt-0.5">{formatPrice(product.price)}</p>
                )}
              </button>
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center py-4 pb-20 md:pb-4">
              <button
                onClick={() => loadTopSellers(selectedCat, products.length)}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-brand-red text-white rounded-full text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-md"
                data-testid="load-more-btn"
              >
                {loadingMore ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Cargando...</>
                ) : (
                  <><ChevronDown className="w-4 h-4" /> Cargar más productos</>
                )}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
