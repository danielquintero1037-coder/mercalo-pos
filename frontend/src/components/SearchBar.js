import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, Star } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function SearchBar({ addToCart, cart = [], onUpdateQty }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([]);
      setSuggested([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const [searchRes, suggestRes] = await Promise.all([
        fetch(`${API}/api/products/search?q=${encodeURIComponent(q)}&limit=10`).then(r => r.json()),
        fetch(`${API}/api/products/suggested?q=${encodeURIComponent(q)}`).then(r => r.json()),
      ]);
      setSuggested(suggestRes);
      // Filter out suggested from main results
      const suggestedIds = new Set(suggestRes.map(s => s.woo_id));
      setResults(searchRes.filter(r => !suggestedIds.has(r.woo_id)));
      setShowDropdown(true);
    } catch {
      setResults([]);
      setSuggested([]);
    }
    setLoading(false);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 200);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      setQuery('');
      return;
    }
    // Enter adds suggested #1
    if (e.key === 'Enter' && suggested.length > 0) {
      e.preventDefault();
      addToCart(suggested[0]);
      setQuery('');
      setShowDropdown(false);
      return;
    }
    // Keys 1-5 add suggested items
    if (showDropdown && suggested.length > 0 && e.altKey) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 5 && suggested[num - 1]) {
        e.preventDefault();
        addToCart(suggested[num - 1]);
        setQuery('');
        setShowDropdown(false);
      }
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global keyboard shortcut: F to focus search
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const cartQtyMap = useMemo(() => {
    const map = {};
    cart.forEach(item => {
      map[item.woo_id] = (map[item.woo_id] || 0) + item.qty;
    });
    return map;
  }, [cart]);

  const handleAdd = (product) => {
    addToCart(product);
    setQuery('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const formatPrice = (price) => {
    const num = parseInt(price || '0');
    return `$${num.toLocaleString('es-CO')}`;
  };

  return (
    <div className="relative px-2 md:px-4 pt-2 md:pt-3 pb-1" ref={dropdownRef} data-testid="search-bar">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setShowDropdown(true)}
          placeholder="Buscar producto..."
          className="w-full pl-10 pr-4 py-2.5 md:py-3 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-red transition-colors"
          data-testid="search-input"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (suggested.length > 0 || results.length > 0) && (
        <div className="absolute left-2 right-2 md:left-4 md:right-4 top-full mt-1 bg-white rounded-lg shadow-2xl border border-gray-100 z-50 max-h-[60vh] md:max-h-[70vh] overflow-y-auto" data-testid="search-dropdown">
          {/* Suggested Panel */}
          {suggested.length > 0 && (
            <div className="border-b border-gray-100" data-testid="suggested-panel">
              <div className="px-3 py-2 bg-amber-50 flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Sugeridos (Alt+1-5 para agregar)</span>
              </div>
              {suggested.map((product, idx) => (
                <ProductRow
                  key={product.woo_id}
                  product={product}
                  onAdd={handleAdd}
                  onIncrement={addToCart}
                  formatPrice={formatPrice}
                  badge={idx + 1}
                  highlighted
                  cartQty={cartQtyMap[product.woo_id] || 0}
                  onUpdateQty={onUpdateQty}
                />
              ))}
            </div>
          )}

          {/* Normal Results */}
          {results.length > 0 && (
            <div data-testid="search-results">
              {results.map(product => (
                <ProductRow
                  key={product.woo_id}
                  product={product}
                  onAdd={handleAdd}
                  onIncrement={addToCart}
                  formatPrice={formatPrice}
                  cartQty={cartQtyMap[product.woo_id] || 0}
                  onUpdateQty={onUpdateQty}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductRow({ product, onAdd, onIncrement, formatPrice, badge, highlighted, cartQty = 0, onUpdateQty }) {
  const isVariable = product.product_type === 'variable' || product.wpp || (product.attributes && product.attributes.length > 0);
  const cartKey = String(product.woo_id);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors group ${highlighted ? 'bg-amber-50/30' : ''}`}
      onClick={() => onAdd(product)}
      data-testid={`product-row-${product.woo_id}`}
    >
      {badge && (
        <span className="w-5 h-5 rounded bg-amber-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {badge}
        </span>
      )}
      <img
        src={product.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%23eee" width="40" height="40"/></svg>'}
        alt=""
        className="w-10 h-10 rounded object-cover shrink-0 bg-gray-100"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
          {isVariable && (
            <span className="shrink-0 text-[9px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded">
              {product.wpp ? 'KG/UND' : 'VAR'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {product.sku && <span>SKU: {product.sku}</span>}
          <span className={product.stock_status === 'instock' ? 'text-green-600' : 'text-red-500'}>
            {product.stock_quantity != null ? `Stock: ${product.stock_quantity}` : product.stock_status === 'instock' ? 'En stock' : 'Agotado'}
          </span>
          {(product.sale_price && product.regular_price && parseInt(product.sale_price) < parseInt(product.regular_price)) && (
            <span className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">OFERTA</span>
          )}
        </div>
      </div>
      {(product.sale_price && product.regular_price && parseInt(product.sale_price) < parseInt(product.regular_price)) ? (
        <div className="shrink-0 text-right">
          <span className="text-[10px] text-gray-400 line-through block">{formatPrice(product.regular_price)}</span>
          <span className="text-sm font-bold text-orange-600">{formatPrice(product.sale_price || product.price)}</span>
        </div>
      ) : (
        <span className="text-sm font-bold text-brand-red shrink-0">{formatPrice(product.price)}</span>
      )}

      {/* Stepper para productos simples en carrito; botón + para variables */}
      {cartQty > 0 && !isVariable ? (
        <div className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onUpdateQty && onUpdateQty(cartKey, -1)}
            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-bold text-gray-700"
            data-testid={`dec-btn-${product.woo_id}`}
          >−</button>
          <span className="w-6 text-center text-sm font-bold text-gray-900">{cartQty}</span>
          <button
            onClick={() => (onIncrement || onAdd)(product)}
            className="w-7 h-7 rounded-full bg-brand-red hover:bg-red-700 flex items-center justify-center text-white"
            data-testid={`inc-btn-${product.woo_id}`}
          ><Plus className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(product); }}
          className={`rounded-full bg-brand-red text-white flex items-center justify-center shrink-0 transition-all ${
            cartQty > 0
              ? 'h-8 px-2 gap-1 min-w-[2rem]'
              : 'w-8 h-8 opacity-100 md:opacity-0 md:group-hover:opacity-100'
          }`}
          data-testid={`add-btn-${product.woo_id}`}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          {cartQty > 0 && <span className="text-xs font-bold leading-none">{cartQty}</span>}
        </button>
      )}
    </div>
  );
}
