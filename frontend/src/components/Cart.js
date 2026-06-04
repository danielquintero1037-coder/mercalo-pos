import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, XCircle, User, Phone, MapPin, FileText, Check, AlertCircle, Headphones, MessageSquare, Loader2, X, Mail, ArrowLeft } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function Cart({ items, updateQty, removeItem, clearCart, updateItemNote, onClose, isMobile, isCustomerMode, onCustomerPhone, customerPhone }) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [customer, setCustomer] = useState({ first_name: '', last_name: '', phone: '', email: '', address_1: '', city: '' });
  const [payment, setPayment] = useState('cod');
  const [note, setNote] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [sede, setSede] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [shippingZones, setShippingZones] = useState([]);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const phoneSearchRef = useRef(null);

  const SEDES = [
    { id: 'señorial', label: 'Señorial', whatsapp: '3185309822' },
    { id: 'la_paz', label: 'La Paz', whatsapp: '3178774108' },
  ];

  useEffect(() => {
    const saved = localStorage.getItem('pos_operator');
    if (saved) setOperatorName(saved);
    // Fetch shipping zones
    fetch(`${API}/api/shipping/zones`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setShippingZones(data); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (operatorName) localStorage.setItem('pos_operator', operatorName);
  }, [operatorName]);

  // Pre-fill phone from customer mode input and auto-lookup
  useEffect(() => {
    if (isCustomerMode && customerPhone && customerPhone.length >= 7) {
      setCustomer(prev => ({ ...prev, phone: customerPhone }));
      // Auto-search customer data
      fetch(`${API}/api/customers/search?phone=${encodeURIComponent(customerPhone)}&local_only=true`)
        .then(r => r.json())
        .then(data => {
          if (data.length > 0) {
            const c = data[0];
            setCustomer({
              first_name: c.first_name || '',
              last_name: c.last_name || '',
              phone: c.phone || customerPhone,
              email: c.email || '',
              address_1: c.address_1 || '',
              city: c.city || '',
            });
          }
        })
        .catch(() => {});
    }
  }, [customerPhone, isCustomerMode]);

  const searchCustomerByPhone = useCallback(async (phone) => {
    if (phone.length < 3) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }
    setSearchingCustomer(true);
    try {
      const localR = await fetch(`${API}/api/customers/search?phone=${encodeURIComponent(phone)}&local_only=true`);
      const localData = await localR.json();
      if (localData.length > 0) {
        setCustomerResults(localData);
        setShowCustomerDropdown(true);
      }
      const fullR = await fetch(`${API}/api/customers/search?phone=${encodeURIComponent(phone)}`);
      const fullData = await fullR.json();
      setCustomerResults(fullData);
      setShowCustomerDropdown(fullData.length > 0);
    } catch {
      setCustomerResults([]);
    }
    setSearchingCustomer(false);
  }, []);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setCustomer(p => ({ ...p, phone: val }));
    if (phoneSearchRef.current) clearTimeout(phoneSearchRef.current);
    phoneSearchRef.current = setTimeout(() => searchCustomerByPhone(val), 400);
  };

  const selectCustomer = (c) => {
    setCustomer({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      email: c.email || '',
      address_1: c.address_1 || '',
      city: c.city || '',
    });
    setShowCustomerDropdown(false);
    setCustomerResults([]);
  };

  const subtotal = items.reduce((sum, item) => sum + parseInt(item.price || '0') * item.qty, 0);
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
  const shippingCost = selectedShipping ? selectedShipping.cost : 0;
  // Free shipping over $200,000
  const freeShippingMethod = shippingZones.find(z => z.cost <= 1 && z.title.toLowerCase().includes('gratis'));
  const qualifiesFreeShipping = freeShippingMethod && subtotal >= 200000;
  const effectiveShipping = qualifiesFreeShipping ? 0 : shippingCost;
  const total = subtotal + effectiveShipping;

  const formatPrice = (price) => {
    const num = typeof price === 'number' ? price : parseInt(price || '0');
    return `$${num.toLocaleString('es-CO')}`;
  };

  const [validationErrors, setValidationErrors] = useState([]);

  const handleSubmitOrder = async () => {
    // Validate required fields
    const errors = [];
    if (!customer.phone) errors.push('Teléfono');
    if (!customer.first_name) errors.push('Nombre');
    if (!customer.last_name) errors.push('Apellido');
    if (!customer.email) errors.push('Correo electrónico');
    if (!customer.address_1) errors.push('Dirección');
    if (!sede) errors.push('Sede');
    if (!selectedShipping) errors.push('Zona de Envío');
    if (!isCustomerMode && !operatorName) errors.push('Operadora');
    if (subtotal < 10000) errors.push('Pedido mínimo $10.000');
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setSubmitting(true);
    setResult(null);
    try {
      const body = {
        customer,
        items: items.map(i => ({
          product_id: i.woo_id,
          variation_id: i.variation_id || null,
          name: i.name,
          quantity: i.qty,
          price: i.price,
          unit_info: i.unit_info || '',
          item_note: i.item_note || '',
        })),
        payment_method: payment,
        note,
        operator_name: isCustomerMode ? 'cliente-web' : operatorName,
        sede,
        shipping_method_id: selectedShipping?.method_id || null,
        shipping_title: qualifiesFreeShipping ? 'Envío gratis' : (selectedShipping?.title || ''),
        shipping_cost: qualifiesFreeShipping ? 0 : (selectedShipping?.cost || 0),
      };
      const r = await fetch(`${API}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.success) {
        if (onCustomerPhone && customer.phone) onCustomerPhone(customer.phone);
        const itemsList = items.map(i => `- ${i.name} x${i.qty} = $${(parseInt(i.price || '0') * i.qty).toLocaleString('es-CO')}`).join('\n');
        const sedeInfo = SEDES.find(s => s.id === sede);
        const sedeLabel = sedeInfo?.label || '';
        const sedeText = sedeLabel ? ` (${sedeLabel})` : '';
        const sedeWA = sedeInfo?.whatsapp || '';
        const shippingText = effectiveShipping > 0 ? `\nDomicilio: $${effectiveShipping.toLocaleString('es-CO')} (${selectedShipping?.title || ''})` : (qualifiesFreeShipping ? '\nDomicilio: GRATIS' : '');
        const msg = `*Pedido #${data.order_number}${sedeText}*\n\nCliente: ${customer.first_name} ${customer.last_name}\nTel: ${customer.phone}\nDirección: ${customer.address_1}\n\n${itemsList}${shippingText}\n\n*Total: $${parseInt(data.total).toLocaleString('es-CO')}*\n\nMétodo de pago: ${payment === 'cod' ? 'Contra entrega' : payment === 'cash' ? 'Efectivo' : 'Transferencia'}`;
        const waPhone = sedeWA || customer.phone.replace(/\D/g, '');
        const waUrl = `https://wa.me/57${waPhone}?text=${encodeURIComponent(msg)}`;
        setResult({ ...data, waUrl });
        // Auto-open WhatsApp confirmation
        window.open(waUrl, '_blank');
      } else {
        setResult(data);
      }
    } catch (err) {
      setResult({ success: false, error: 'Error de conexión' });
    }
    setSubmitting(false);
  };

  return (
    <div className={`bg-white flex flex-col shrink-0 ${isMobile ? 'w-full h-full' : 'w-80 xl:w-96 border-l border-gray-200'}`} data-testid="cart-panel">
      {/* Header */}
      <div className="px-3 md:px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isMobile && onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="back-cart-btn">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
          )}
          <ShoppingCart className="w-4 h-4 text-brand-red" />
          <h2 className="text-sm font-bold text-gray-800">CARRITO</h2>
          {totalItems > 0 && (
            <span className="bg-brand-red text-white text-xs font-bold px-1.5 py-0.5 rounded-full" data-testid="cart-count">{totalItems}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button onClick={clearCart} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1" data-testid="clear-cart-btn">
              <XCircle className="w-3.5 h-3.5" /> Vaciar
            </button>
          )}
          {isMobile && onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="close-mobile-cart">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Items or Checkout */}
      <div className="flex-1 overflow-y-auto" data-testid="cart-items">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 py-12">
            <ShoppingCart className="w-12 h-12 mb-2" />
            <p className="text-sm">Carrito vacío</p>
          </div>
        ) : !showCheckout ? (
          <div className="divide-y divide-gray-50">
            {items.map(item => (
              <div key={item._cartKey} className="px-3 py-2 group" data-testid={`cart-item-${item._cartKey}`}>
                <div className="flex gap-2">
                  <img src={item.image_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%23eee" width="40" height="40"/></svg>'} alt="" className="w-10 h-10 rounded object-cover shrink-0 bg-gray-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-brand-red font-bold">{formatPrice(item.price)} c/u</p>
                      {item.unit_info && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" data-testid={`unit-badge-${item._cartKey}`}>
                          {item.unit_info}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <button onClick={() => updateQty(item._cartKey, -1)} className="w-7 h-7 md:w-6 md:h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center" data-testid={`qty-minus-${item._cartKey}`}>
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(item._cartKey, 1)} className="w-7 h-7 md:w-6 md:h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center" data-testid={`qty-plus-${item._cartKey}`}>
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeItem(item._cartKey)} className="w-7 h-7 md:w-6 md:h-6 rounded hover:bg-red-50 flex items-center justify-center ml-auto text-gray-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100" data-testid={`remove-btn-${item._cartKey}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-gray-700 shrink-0 self-center">{formatPrice(parseInt(item.price || '0') * item.qty)}</div>
                </div>
                <div className="mt-1 ml-12">
                  <div className="relative">
                    <MessageSquare className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Nota del producto..."
                      value={item.item_note || ''}
                      onChange={e => updateItemNote(item._cartKey, e.target.value)}
                      className="w-full pl-6 pr-2 py-1 border border-gray-150 rounded text-[11px] text-gray-600 focus:outline-none focus:border-brand-red placeholder:text-gray-300"
                      data-testid={`item-note-${item._cartKey}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-3" data-testid="checkout-form">
            {validationErrors.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200" data-testid="validation-errors">
                <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Faltan campos obligatorios:</span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {validationErrors.map(e => (
                    <li key={e} className="text-xs text-red-600 font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result && (
              <div className={`p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`} data-testid="order-result">
                <div className="flex items-center gap-2 font-bold">
                  {result.success ? <Check className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                  <span>{result.success ? `Pedido #${result.order_number} creado` : result.error}</span>
                </div>
                {result.success && (
                  <p className="text-xs mt-1 font-medium">Total: ${parseInt(result.total).toLocaleString('es-CO')}</p>
                )}
                {result.waUrl && (
                  <a href={result.waUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-3 flex items-center justify-center gap-2.5 w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-colors shadow-md"
                    data-testid="whatsapp-confirm-btn">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Enviar confirmación por WhatsApp
                  </a>
                )}
                {result.success && (
                  <button onClick={() => {
                    clearCart();
                    setShowCheckout(false);
                    setCustomer({ first_name: '', last_name: '', phone: '', email: '', address_1: '', city: '' });
                    setNote('');
                    setResult(null);
                  }}
                    className="mt-2 w-full py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                    data-testid="new-order-btn">
                    Nuevo Pedido
                  </button>
                )}
              </div>
            )}

            {isCustomerMode ? (
              <div className="flex items-center gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded">
                <ShoppingCart className="w-3.5 h-3.5 text-brand-red" />
                <span className="text-xs font-bold text-brand-red uppercase">Tu Pedido</span>
                {customer.phone && (
                  <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{customer.phone}
                  </span>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-bold text-blue-700 uppercase">Pedido por Teléfono</span>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                    <Headphones className="w-3 h-3" /> Operadora
                  </label>
                  <input type="text" placeholder="Nombre de la operadora *" value={operatorName} onChange={e => setOperatorName(e.target.value)}
                    className="w-full mt-1 px-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red" data-testid="operator-name" />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                <Phone className="w-3 h-3" /> {isCustomerMode ? 'Tu Teléfono' : 'Teléfono del Cliente'}
              </label>
              <div className="mt-1 relative">
                <Phone className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="tel" placeholder="Teléfono *" value={customer.phone} onChange={isCustomerMode ? (e => setCustomer(p => ({...p, phone: e.target.value}))) : handlePhoneChange}
                  className="w-full pl-7 pr-8 py-2.5 md:py-2 border-2 border-gray-200 rounded-lg text-sm md:text-xs font-medium focus:outline-none focus:border-brand-red"
                  data-testid="customer-phone" autoComplete="off" />
                {!isCustomerMode && searchingCustomer && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-red animate-spin" />
                )}
              </div>
              {!isCustomerMode && showCustomerDropdown && customerResults.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden z-10 relative" data-testid="customer-dropdown">
                  <div className="px-2 py-1 bg-green-50 text-[10px] font-semibold text-green-700 uppercase tracking-wide">
                    Clientes encontrados
                  </div>
                  {customerResults.map((c, idx) => (
                    <button key={idx} onClick={() => selectCustomer(c)}
                      className="w-full px-2 py-2 md:py-1.5 text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-50 transition-colors"
                      data-testid={`customer-option-${idx}`}>
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm md:text-xs font-medium text-gray-800 truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-xs md:text-[10px] text-gray-500 truncate">{c.phone} {c.city ? `· ${c.city}` : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{isCustomerMode ? 'Tus Datos' : 'Datos del Cliente'}</label>
              <div className="mt-1 space-y-1.5">
                <div className="relative">
                  <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Nombre *" value={customer.first_name} onChange={e => setCustomer(p => ({...p, first_name: e.target.value}))}
                    className="w-full pl-7 pr-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red" data-testid="customer-name" />
                </div>
                <div className="relative">
                  <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Apellido *" value={customer.last_name} onChange={e => setCustomer(p => ({...p, last_name: e.target.value}))}
                    className="w-full pl-7 pr-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red" data-testid="customer-lastname" />
                </div>
                <div className="relative">
                  <Mail className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="email" placeholder="Correo electrónico *" value={customer.email} onChange={e => setCustomer(p => ({...p, email: e.target.value}))}
                    className="w-full pl-7 pr-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red" data-testid="customer-email" />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Dirección" value={customer.address_1} onChange={e => setCustomer(p => ({...p, address_1: e.target.value}))}
                    className="w-full pl-7 pr-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red" data-testid="customer-address" />
                </div>
                <input type="text" placeholder="Ciudad" value={customer.city} onChange={e => setCustomer(p => ({...p, city: e.target.value}))}
                  className="w-full px-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red" data-testid="customer-city" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Método de Pago</label>
              <div className="mt-1 flex gap-1.5">
                {[{ id: 'cod', label: 'Contra entrega' }, { id: 'cash', label: 'Efectivo' }, { id: 'transfer', label: 'Transferencia' }].map(m => (
                  <button key={m.id} onClick={() => setPayment(m.id)}
                    className={`flex-1 py-2 md:py-1.5 rounded text-xs font-medium transition-colors ${payment === m.id ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    data-testid={`payment-${m.id}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Sede</label>
              <div className="mt-1 flex gap-1.5">
                {SEDES.map(s => (
                  <button key={s.id} onClick={() => setSede(s.id)}
                    className={`flex-1 py-2 md:py-1.5 rounded text-xs font-medium transition-colors ${sede === s.id ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    data-testid={`sede-${s.id}`}>{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Zona de Envío (Domicilio)
              </label>
              <div className="mt-1 space-y-1">
                {shippingZones.filter(z => z.cost > 1).map(z => {
                  const isSelected = selectedShipping?.method_id === z.method_id;
                  const isFree = qualifiesFreeShipping;
                  return (
                    <button key={z.method_id} onClick={() => setSelectedShipping(isSelected ? null : z)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 md:py-1.5 rounded text-xs font-medium transition-colors ${
                        isSelected ? 'bg-brand-red text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                      data-testid={`shipping-${z.method_id}`}>
                      <span className="text-left">{z.title}</span>
                      <span className={`font-bold ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {isFree && isSelected ? 'GRATIS' : `$${parseInt(z.cost).toLocaleString('es-CO')}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {qualifiesFreeShipping && selectedShipping && selectedShipping.cost > 0 && (
                <p className="mt-1 text-[10px] font-bold text-green-600" data-testid="free-shipping-msg">
                  Envío GRATIS por compras superiores a $200.000
                </p>
              )}
            </div>
            <div className="relative">
              <FileText className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" />
              <textarea placeholder="Nota del pedido (opcional)" value={note} onChange={e => setNote(e.target.value)}
                className="w-full pl-7 pr-2 py-2 md:py-1.5 border rounded text-sm md:text-xs focus:outline-none focus:border-brand-red resize-none h-14 md:h-12" data-testid="order-note" />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="border-t border-gray-200 p-3 space-y-2 safe-bottom" data-testid="cart-footer">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{totalItems} items</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {subtotal < 10000 && (
              <div className="text-[10px] text-orange-600 font-bold text-center py-0.5" data-testid="min-order-msg">
                Pedido mínimo $10.000 — Faltan {formatPrice(10000 - subtotal)}
              </div>
            )}
            {showCheckout && effectiveShipping > 0 && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Domicilio</span>
                <span>{formatPrice(effectiveShipping)}</span>
              </div>
            )}
            {showCheckout && qualifiesFreeShipping && selectedShipping && selectedShipping.cost > 0 && (
              <div className="flex items-center justify-between text-xs text-green-600 font-bold">
                <span>Domicilio</span>
                <span>GRATIS</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">Total</span>
              <span className="text-xl font-bold text-gray-900" data-testid="cart-total">{formatPrice(total)}</span>
            </div>
          </div>
          {!showCheckout ? (
            <button onClick={() => setShowCheckout(true)}
              className="w-full py-3 md:py-2.5 bg-brand-red hover:bg-brand-red-dark text-white font-bold rounded-lg transition-colors text-sm uppercase tracking-wide"
              data-testid="checkout-btn">{isCustomerMode ? 'Hacer Pedido' : 'Crear Pedido'}</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setShowCheckout(false); setResult(null); }}
                className="w-20 shrink-0 py-3 md:py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-xs" data-testid="back-btn">Volver</button>
              <button onClick={handleSubmitOrder} disabled={submitting}
                className="flex-1 py-3 md:py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="submit-order-btn">
                {submitting ? 'Enviando...' : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Confirmar y Enviar WhatsApp
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
