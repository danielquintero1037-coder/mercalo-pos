import React, { useState, useEffect, useCallback } from 'react';
import { Package, RefreshCw, Loader2, ShoppingCart } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_LABELS = {
  'pending': 'Pendiente', 'on-hold': 'En espera', 'processing': 'Procesando',
  'completed': 'Completado', 'cancelled': 'Cancelado', 'shipped': 'En camino',
};
const STATUS_COLORS = {
  'completed': 'bg-green-100 text-green-700',
  'processing': 'bg-blue-100 text-blue-700',
  'cancelled': 'bg-red-100 text-red-700',
};

export default function RecentOrders({ phone, addToCart }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(null);

  const loadOrders = useCallback(async () => {
    if (!phone || phone.length < 7) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/customer/orders?phone=${encodeURIComponent(phone)}`);
      const data = await r.json();
      setOrders(data);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleReorder = useCallback(async (order) => {
    setReordering(order.wc_order_id);
    try {
      // Fetch current prices for all products in one call
      const productIds = order.items.map(i => i.product_id);
      const r = await fetch(`${API}/api/products/by-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: productIds }),
      });
      const currentProducts = await r.json();
      const productMap = {};
      for (const p of currentProducts) {
        productMap[p.woo_id] = p;
      }

      // Add each item to cart with updated prices
      let added = 0;
      for (const item of order.items) {
        const currentProduct = productMap[item.product_id];
        if (currentProduct) {
          const cartItem = {
            ...currentProduct,
            qty: item.quantity,
            variation_id: item.variation_id || null,
            unit_info: item.unit_info || '',
            item_note: item.item_note || '',
          };
          addToCart(cartItem);
          added++;
        }
      }

      if (added === 0) {
        alert('No se pudieron encontrar los productos. Es posible que hayan cambiado.');
      }
    } catch {
      alert('Error al buscar productos actualizados');
    }
    setReordering(null);
  }, [addToCart]);

  const formatPrice = (p) => `$${parseInt(p || '0').toLocaleString('es-CO')}`;
  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };

  if (!phone || phone.length < 7 || (!loading && orders.length === 0)) return null;

  return (
    <div className="px-2 md:px-4 py-2" data-testid="recent-orders-section">
      <div className="flex items-center gap-1.5 mb-2">
        <Package className="w-4 h-4 text-brand-red" />
        <h2 className="text-xs md:text-sm font-bold text-gray-800 uppercase tracking-wide">Mis Pedidos</h2>
        <span className="text-[10px] text-gray-400">Toca para volver a pedir</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-16">
          <Loader2 className="w-5 h-5 animate-spin text-brand-red" />
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" data-testid="recent-orders-list">
          {orders.slice(0, 8).map(order => (
            <div
              key={order.wc_order_id}
              className="shrink-0 w-44 md:w-52 bg-white rounded-lg border border-gray-200 p-2.5 hover:border-brand-red hover:shadow-md transition-all"
              data-testid={`recent-order-${order.wc_order_id}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-800">#{order.wc_order_id}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 mb-1.5">{formatDate(order.created_at)}</div>
              <div className="space-y-0.5 mb-2">
                {(order.items || []).slice(0, 3).map((item, idx) => (
                  <div key={idx} className="text-[10px] text-gray-600 truncate">
                    {item.name} x{item.quantity}
                  </div>
                ))}
                {(order.items || []).length > 3 && (
                  <div className="text-[9px] text-gray-400">+{order.items.length - 3} más</div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">{formatPrice(order.total)}</span>
                <button
                  onClick={() => handleReorder(order)}
                  disabled={reordering === order.wc_order_id}
                  className="flex items-center gap-1 px-2 py-1 bg-brand-red text-white rounded text-[10px] font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                  data-testid={`reorder-${order.wc_order_id}`}
                >
                  {reordering === order.wc_order_id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Pedir otra vez
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
