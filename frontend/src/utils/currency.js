/**
 * Formats monetary amounts in Ethiopian Birr (ETB)
 * Example: formatCurrency(1250) -> "ETB 1,250.00"
 */
export function formatCurrency(amount) {
  const numeric = typeof amount === "number" ? amount : parseFloat(amount || 0);
  if (isNaN(numeric)) {
    return "ETB 0.00";
  }
  return `ETB ${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default formatCurrency;
