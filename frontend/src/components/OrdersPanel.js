import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, X, Filter, Phone, User, Calendar, DollarSign, ChevronDown, ChevronUp, MapPin, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const SEDE_LABELS = { 'señorial': 'Señorial', 'la_paz': 'La Paz' };
const STATUS_LABELS = {
  'pending': 'Pendiente', 'on-hold': 'En espera', 'processing': 'Procesando',
  'completed': 'Completado', 'cancelled': 'Cancelado', 'shipped': 'En camino',
};

function WhatsAppNotifyBtn({ orderId }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/orders/whatsapp-link/${orderId}`);
      const data = await r.json();
      if (data.whatsapp_url) window.open(data.whatsapp_url, '_blank');
    } catch {}
    setLoading(false);
  };
  return (
    <button onClick={handleClick} disabled={loading}
      className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
      data-testid={`wa-notify-${orderId}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      )}
      Notificar por WhatsApp
    </button>
  );
}

export default function OrdersPanel({ onClose }) {
  const [orders, setOrders] = useState([]);
  const [operators, setOperators] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOp, setFilterOp] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [expanded, setExpanded] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOp) params.set('operator', filterOp);
      if (filterPhone) params.set('phone', filterPhone);
      if (filterDate) params.set('date', filterDate);
      params.set('limit', '50');

      const [ordersRes, opsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/orders/recent?${params}`).then(r => r.json()),
        fetch(`${API}/api/orders/operators`).then(r => r.json()),
        fetch(`${API}/api/orders/stats?date=${filterDate}`).then(r => r.json()),
      ]);
      setOrders(ordersRes);
      setOperators(opsRes);
      setStats(statsRes);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  }, [filterOp, filterPhone, filterDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatPrice = (p) => `$${Math.round(parseFloat(p || 0)).toLocaleString('es-CO')}`;
  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 md:p-4" onClick={onClose} data-testid="orders-panel">
      <div className="bg-white md:rounded-xl shadow-2xl w-full h-full md:w-[800px] md:max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-brand-red" />
            <h2 className="font-bold text-gray-900">Pedidos Recientes</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="close-orders">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="px-3 md:px-5 py-2 bg-gray-50 border-b flex flex-wrap items-center gap-3 md:gap-6 text-xs" data-testid="orders-stats">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-medium text-gray-700">{filterDate}</span>
            </div>
            <div className="flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5 text-brand-red" />
              <span className="font-bold text-gray-800">{stats.total_orders} pedidos</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-green-600" />
              <span className="font-bold text-gray-800">{formatPrice(stats.total_revenue)}</span>
            </div>
            {stats.by_operator.map(op => (
              <button key={op.operator} onClick={() => setFilterOp(filterOp === op.operator ? '' : op.operator)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${filterOp === op.operator ? 'bg-brand-red text-white' : 'bg-white border text-gray-600 hover:bg-gray-100'}`}
                data-testid={`filter-op-${op.operator}`}>
                {op.operator}: {op.count} ({formatPrice(op.total)})
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="px-3 md:px-5 py-2 border-b flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3" data-testid="orders-filters">
          <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0 hidden md:block" />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="px-2 py-1.5 md:py-1 border rounded text-xs focus:outline-none focus:border-brand-red flex-1 md:flex-none" data-testid="filter-date" />
          <select value={filterOp} onChange={e => setFilterOp(e.target.value)}
            className="px-2 py-1.5 md:py-1 border rounded text-xs focus:outline-none focus:border-brand-red flex-1 md:flex-none" data-testid="filter-operator">
            <option value="">Todas las operadoras</option>
            {operators.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <div className="relative flex-1 w-full md:w-auto">
            <Phone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input type="text" placeholder="Buscar por teléfono..." value={filterPhone} onChange={e => setFilterPhone(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 md:py-1 border rounded text-xs focus:outline-none focus:border-brand-red" data-testid="filter-phone" />
          </div>
        </div>

        {/* Orders list */}
        <div className="flex-1 overflow-y-auto" data-testid="orders-list">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              No hay pedidos con estos filtros
            </div>
          ) : (
            <div className="divide-y">
              {orders.map((order, idx) => (
                <div key={order.wc_order_id || idx} className="hover:bg-gray-50 transition-colors">
                  <button className="w-full px-3 md:px-5 py-2.5 flex items-center gap-2 md:gap-4 text-left"
                    onClick={() => setExpanded(expanded === idx ? null : idx)} data-testid={`order-row-${order.wc_order_id}`}>
                    <div className="w-16 shrink-0">
                      <span className="text-xs font-bold text-brand-red">#{order.wc_order_id}</span>
                      {order.sede && (
                        <p className="text-[10px] font-bold text-green-600">({SEDE_LABELS[order.sede] || order.sede})</p>
                      )}
                      <p className="text-[10px] text-gray-400">{formatTime(order.created_at)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {order.customer_name}
                      </p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" /> {order.customer_phone}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{formatPrice(order.total)}</p>
                      <p className="text-[10px] text-gray-500">{order.items?.length || 0} items</p>
                    </div>
                    <div className="shrink-0 w-20 text-right">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded">
                        <User className="w-2.5 h-2.5" /> {order.operator || '—'}
                      </span>
                      <span className={`block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        order.status === 'completed' ? 'bg-green-50 text-green-700' :
                        order.status === 'processing' ? 'bg-blue-50 text-blue-600' :
                        'bg-gray-50 text-gray-500'
                      }`}>{STATUS_LABELS[order.status] || order.status || 'Procesando'}</span>
                    </div>
                    <div className="shrink-0">
                      {expanded === idx ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                    </div>
                  </button>
                  {expanded === idx && (
                    <div className="px-3 md:px-5 pb-3 md:pl-20" data-testid={`order-detail-${order.wc_order_id}`}>
                      <div className="bg-gray-50 rounded p-2 space-y-1">
                        {(order.items || []).map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-700">{item.name} x{item.quantity}</span>
                            <span className="font-medium">{formatPrice(parseInt(item.price) * item.quantity)}</span>
                          </div>
                        ))}
                        <div className="border-t pt-1 mt-1 flex justify-between text-xs font-bold">
                          <span>Pago: {order.payment_method}</span>
                          <span>{formatPrice(order.total)}</span>
                        </div>
                        {order.sede && (
                          <div className="text-[10px] text-green-600 font-bold flex items-center gap-1 pt-1">
                            <MapPin className="w-3 h-3" /> Sede: ({SEDE_LABELS[order.sede] || order.sede})
                          </div>
                        )}
                      </div>
                      <WhatsAppNotifyBtn orderId={order.wc_order_id} />
                    </div>
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
