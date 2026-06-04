import React, { useState, useEffect, useCallback } from 'react';
import { X, Phone, Package, Clock, CheckCircle, Truck, Search, Loader2, RefreshCw, ShoppingCart } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const SEDE_LABELS = { 'señorial': 'Señorial', 'la_paz': 'La Paz' };

const STATUS_MAP = {
  'pending': { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700', icon: Clock, step: 0 },
  'on-hold': { label: 'En espera', color: 'bg-yellow-100 text-yellow-700', icon: Clock, step: 0 },
  'processing': { label: 'Procesando', color: 'bg-blue-100 text-blue-700', icon: Package, step: 1 },
  'completed': { label: 'Completado', color: 'bg-green-100 text-green-700', icon: CheckCircle, step: 2 },
  'cancelled': { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: X, step: -1 },
  'refunded': { label: 'Reembolsado', color: 'bg-gray-100 text-gray-600', icon: X, step: -1 },
  'failed': { label: 'Fallido', color: 'bg-red-100 text-red-700', icon: X, step: -1 },
  'unknown': { label: 'Desconocido', color: 'bg-gray-100 text-gray-500', icon: Clock, step: -1 },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP['unknown'];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.color}`} data-testid={`status-badge-${status}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

function StatusTracker({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP['unknown'];
  const steps = [
    { label: 'En espera', step: 0 },
    { label: 'Procesando', step: 1 },
    { label: 'Completado', step: 2 },
  ];
  if (s.step < 0) return <StatusBadge status={status} />;
  return (
    <div className="flex items-center gap-1 my-2" data-testid="status-tracker">
      {steps.map((st, idx) => (
        <React.Fragment key={idx}>
          <div className={`flex flex-col items-center ${s.step >= st.step ? 'text-green-600' : 'text-gray-300'}`}>
            <div className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-xs font-bold ${s.step >= st.step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
              {s.step > st.step ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
            </div>
            <span className="text-[9px] md:text-[10px] mt-0.5 font-medium whitespace-nowrap">{st.label}</span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mt-[-12px] ${s.step > st.step ? 'bg-green-500' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function MyOrders({ onClose, addToCart, customerPhone }) {
  const [phone, setPhone] = useState(customerPhone || '');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [refreshing, setRefreshing] = useState({});
  const [reordering, setReordering] = useState(null);

  const searchOrders = useCallback(async (phoneToSearch) => {
    const p = phoneToSearch || phone;
    if (p.length < 7) return;
    setLoading(true);
    setSearched(true);
    try {
      const r = await fetch(`${API}/api/customer/orders?phone=${encodeURIComponent(p)}`);
      const data = await r.json();
      setOrders(data);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  }, [phone]);

  // Auto-search if customerPhone provided
  useEffect(() => {
    if (customerPhone && customerPhone.length >= 7) {
      setPhone(customerPhone);
      searchOrders(customerPhone);
    }
  }, [customerPhone]);

  const refreshStatus = useCallback(async (orderId) => {
    setRefreshing(prev => ({ ...prev, [orderId]: true }));
    try {
      const r = await fetch(`${API}/api/customer/order-status/${orderId}`);
      const data = await r.json();
      setOrders(prev => prev.map(o => o.wc_order_id === orderId ? { ...o, status: data.status } : o));
    } catch {}
    setRefreshing(prev => ({ ...prev, [orderId]: false }));
  }, []);

  const handleReorder = useCallback(async (order) => {
    if (!addToCart) return;
    setReordering(order.wc_order_id);
    try {
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

      let added = 0;
      for (const item of order.items) {
        const currentProduct = productMap[item.product_id];
        if (currentProduct) {
          addToCart({
            ...currentProduct,
            qty: item.quantity,
            variation_id: item.variation_id || null,
            unit_info: item.unit_info || '',
            item_note: item.item_note || '',
          });
          added++;
        }
      }

      if (added > 0) {
        onClose();
      } else {
        alert('No se pudieron encontrar los productos.');
      }
    } catch {
      alert('Error al buscar productos actualizados');
    }
    setReordering(null);
  }, [addToCart, onClose]);

  const formatPrice = (p) => `$${parseInt(p || '0').toLocaleString('es-CO')}`;
  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 md:p-4" onClick={onClose} data-testid="my-orders-panel">
      <div className="bg-white md:rounded-xl shadow-2xl w-full h-full md:w-[500px] md:max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-brand-red text-white md:rounded-t-xl">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            <h2 className="font-bold text-base">Mis Pedidos</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center" data-testid="close-my-orders">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Phone search */}
        <div className="px-4 py-3 border-b">
          <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Ingresa tu teléfono</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                placeholder="Tu número de teléfono"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchOrders()}
                className="w-full pl-8 pr-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-red"
                data-testid="my-orders-phone"
              />
            </div>
            <button onClick={() => searchOrders()} disabled={phone.length < 7 || loading}
              className="px-4 py-2.5 bg-brand-red text-white rounded-lg font-medium text-sm disabled:opacity-50 flex items-center gap-1.5"
              data-testid="my-orders-search-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
        </div>

        {/* Orders list */}
        <div className="flex-1 overflow-y-auto">
          {!searched ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 py-12">
              <Truck className="w-12 h-12 mb-2" />
              <p className="text-sm">Ingresa tu teléfono para ver tus pedidos</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-red" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">No se encontraron pedidos</p>
            </div>
          ) : (
            <div className="divide-y">
              {orders.map(order => (
                <div key={order.wc_order_id} className="px-4 py-3" data-testid={`my-order-${order.wc_order_id}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800">#{order.wc_order_id}</span>
                      {order.sede && (
                        <span className="text-[10px] font-bold text-green-600">({SEDE_LABELS[order.sede] || order.sede})</span>
                      )}
                      <StatusBadge status={order.status || 'processing'} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-brand-red">{formatPrice(order.total)}</span>
                      <button onClick={() => refreshStatus(order.wc_order_id)}
                        className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center"
                        data-testid={`refresh-status-${order.wc_order_id}`}>
                        {refreshing[order.wc_order_id] ? (
                          <Loader2 className="w-3 h-3 animate-spin text-brand-red" />
                        ) : (
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <StatusTracker status={order.status || 'processing'} />
                  <div className="text-[10px] text-gray-400 mt-1">{formatDate(order.created_at)}</div>
                  {order.items && (
                    <div className="mt-1.5 space-y-0.5">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="text-xs text-gray-600 flex justify-between">
                          <span className="truncate flex-1">{item.name} x{item.quantity}</span>
                          <span className="font-medium shrink-0 ml-2">{formatPrice(parseInt(item.price) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reorder button */}
                  {addToCart && order.items && order.items.length > 0 && (
                    <button
                      onClick={() => handleReorder(order)}
                      disabled={reordering === order.wc_order_id}
                      className="mt-2.5 w-full flex items-center justify-center gap-2 py-2.5 bg-brand-red hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                      data-testid={`reorder-${order.wc_order_id}`}
                    >
                      {reordering === order.wc_order_id ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Cargando productos...</>
                      ) : (
                        <><RefreshCw className="w-4 h-4" /> Volver a pedir (precios actualizados)</>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
