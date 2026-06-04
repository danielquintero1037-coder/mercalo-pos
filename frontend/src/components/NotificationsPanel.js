import React, { useState, useEffect, useCallback } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_LABELS = {
  'pending': 'Pendiente', 'on-hold': 'En espera', 'processing': 'Procesando',
  'completed': 'Completado', 'cancelled': 'Cancelado', 'shipped': 'En camino',
  'out-for-delivery': 'En camino',
};

const STATUS_COLORS = {
  'completed': 'bg-green-100 text-green-700',
  'shipped': 'bg-blue-100 text-blue-700',
  'out-for-delivery': 'bg-blue-100 text-blue-700',
  'cancelled': 'bg-red-100 text-red-700',
  'processing': 'bg-yellow-100 text-yellow-700',
};

function WhatsAppIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  );
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/notifications`);
      const data = await r.json();
      setNotifications(data);
    } catch {}
  }, []);

  // Poll every 15 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markSeen = async () => {
    try {
      await fetch(`${API}/api/notifications/mark-seen`, { method: 'POST' });
      setNotifications([]);
    } catch {}
  };

  const handleOpenWA = async (orderId) => {
    try {
      const r = await fetch(`${API}/api/orders/whatsapp-link/${orderId}`);
      const data = await r.json();
      if (data.whatsapp_url) window.open(data.whatsapp_url, '_blank');
    } catch {}
  };

  const count = notifications.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium"
        data-testid="notifications-bell"
      >
        <Bell className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Alertas</span>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-yellow-400 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow" data-testid="notification-count">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border z-50 max-h-[70vh] flex flex-col" data-testid="notifications-dropdown">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-brand-red" />
              <h3 className="text-sm font-bold text-gray-800">Cambios de Estado</h3>
            </div>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button onClick={markSeen} className="text-[10px] text-gray-400 hover:text-gray-600 font-medium" data-testid="mark-all-seen">
                  Marcar leídas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {count === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                <Bell className="w-8 h-8 mb-2" />
                <p className="text-xs">No hay notificaciones nuevas</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n, i) => (
                  <div key={`${n.wc_order_id}-${i}`} className="px-4 py-3 hover:bg-gray-50 transition-colors" data-testid={`notification-${n.wc_order_id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-brand-red">#{n.wc_order_id}</span>
                          {n.sede && <span className="text-[10px] font-bold text-green-600">({n.sede})</span>}
                        </div>
                        <p className="text-xs text-gray-700 font-medium mt-0.5 truncate">{n.customer_name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-gray-400">{STATUS_LABELS[n.old_status] || n.old_status}</span>
                          <span className="text-[10px] text-gray-400">→</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[n.new_status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[n.new_status] || n.new_status}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenWA(n.wc_order_id)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[11px] font-bold transition-colors shadow-sm"
                        data-testid={`wa-notify-status-${n.wc_order_id}`}
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        Notificar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
