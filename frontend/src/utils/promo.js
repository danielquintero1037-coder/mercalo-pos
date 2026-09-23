// Una oferta solo es real si el precio vigente (price) es menor al regular.
// sale_price por sí solo no basta: WooCommerce lo conserva con ofertas programadas o vencidas.
export function hasPromo(product) {
  const price = parseInt(product?.price);
  const regular = parseInt(product?.regular_price);
  return !!(price > 0 && regular > 0 && price < regular);
}
