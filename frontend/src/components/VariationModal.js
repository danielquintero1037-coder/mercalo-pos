import React, { useState, useEffect } from 'react';
import { X, Scale, Package } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function VariationModal({ product, onAdd, onClose }) {
  const [loading, setLoading] = useState(true);
  const [variationData, setVariationData] = useState(null);
  const [selectedAttrs, setSelectedAttrs] = useState({});
  const [weightUnit, setWeightUnit] = useState('UND');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetch(`${API}/api/products/${product.woo_id}/variations`)
      .then(r => r.json())
      .then(data => {
        setVariationData(data);
        // Pre-select first option for each attribute
        const defaults = {};
        (data.attributes || []).forEach(attr => {
          if (attr.options.length > 0) defaults[attr.name] = attr.options[0];
        });
        setSelectedAttrs(defaults);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [product.woo_id]);

  const findMatchingVariation = () => {
    if (!variationData?.variations) return null;
    return variationData.variations.find(v => {
      return Object.entries(selectedAttrs).every(([name, value]) => v.attributes[name] === value);
    });
  };

  const calcPrice = () => {
    const matched = findMatchingVariation();
    const basePrice = matched ? parseFloat(matched.price) : parseFloat(product.price);
    const wpp = variationData?.wpp;

    if (wpp) {
      const pricePerKg = parseFloat(wpp.price_per_kg || basePrice);
      const avgWeightUnd = parseFloat(wpp.avg_weight_und || 0.2);
      if (weightUnit === 'KG') return pricePerKg * quantity;
      if (weightUnit === 'LB') return pricePerKg * 0.453592 * quantity;
      return pricePerKg * avgWeightUnd * quantity; // UND
    }
    return basePrice * quantity;
  };

  const handleAdd = () => {
    const matched = findMatchingVariation();
    const finalPrice = calcPrice();
    const attrLabel = Object.values(selectedAttrs).join(' / ');
    const wpp = variationData?.wpp;
    let unitLabel = '';
    let unitInfo = '';
    if (wpp) {
      unitLabel = ` (${quantity} ${weightUnit})`;
      unitInfo = `${quantity} ${weightUnit}`;
    }

    onAdd({
      ...product,
      variation_id: matched?.variation_id || null,
      name: `${product.name}${attrLabel ? ' - ' + attrLabel : ''}${unitLabel}`,
      price: String(Math.round(finalPrice / quantity)),
      qty: quantity,
      sku: matched?.sku || product.sku,
      unit_info: unitInfo,
    });
    onClose();
  };

  const formatPrice = (num) => `$${Math.round(num).toLocaleString('es-CO')}`;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-xl p-6 shadow-2xl">
          <div className="w-8 h-8 border-3 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const wpp = variationData?.wpp;
  const totalPrice = calcPrice();

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose} data-testid="variation-modal">
      <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-[380px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b">
          <img src={product.image_url || ''} alt="" className="w-14 h-14 rounded-lg object-cover bg-gray-100" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{product.name}</p>
            <p className="text-brand-red font-bold text-sm">{formatPrice(parseFloat(product.price))}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="close-variation-modal">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Variation Attributes (filtrar CANTIDAD — redundante con WPP) */}
          {(variationData?.attributes || []).filter(attr => attr.name.toUpperCase() !== 'CANTIDAD').map(attr => (
            <div key={attr.name}>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> {attr.name}
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {attr.options.map(opt => (
                  <button key={opt} onClick={() => setSelectedAttrs(p => ({...p, [attr.name]: opt}))}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors border-2 ${
                      selectedAttrs[attr.name] === opt
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}
                    data-testid={`attr-${attr.name}-${opt}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Weight Unit Selector (WPP) */}
          {wpp && (
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                <Scale className="w-3.5 h-3.5" /> Peso
              </label>
              <div className="mt-2 flex gap-2">
                {['UND', 'LB', 'KG'].map(unit => (
                  <button key={unit} onClick={() => { setWeightUnit(unit); setQuantity(1); }}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors border-2 ${
                      weightUnit === unit
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}
                    data-testid={`weight-${unit}`}>
                    {unit}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {weightUnit === 'KG' && `${formatPrice(parseFloat(wpp.price_per_kg))}/kg`}
                {weightUnit === 'LB' && `${formatPrice(parseFloat(wpp.price_per_kg) * 0.453592)}/lb`}
                {weightUnit === 'UND' && `~${wpp.avg_weight_und}kg/und = ${formatPrice(parseFloat(wpp.price_per_kg) * parseFloat(wpp.avg_weight_und))}/und`}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cantidad</label>
            <div className="mt-1.5 flex items-center gap-2">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg font-bold">-</button>
              <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-10 text-center border rounded-lg text-sm font-bold focus:outline-none focus:border-brand-red"
                data-testid="variation-qty" min="1" />
              <button onClick={() => setQuantity(q => q + 1)}
                className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg font-bold">+</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-bold text-gray-900" data-testid="variation-total">{formatPrice(totalPrice)}</p>
          </div>
          <button onClick={handleAdd}
            className="px-6 py-2.5 bg-brand-red hover:bg-brand-red-dark text-white font-bold rounded-lg text-sm uppercase transition-colors"
            data-testid="add-variation-btn">
            Agregar al Carrito
          </button>
        </div>
      </div>
    </div>
  );
}
