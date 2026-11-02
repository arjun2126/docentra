/**
 * Exact decimal arithmetic for document amounts.
 *
 * Quantities have up to 4 decimals and prices up to 2, so a line amount is
 * quantity * price rounded half-up to 2 decimals — the same rule the database
 * CHECK constraint enforces. Everything is done with BigInt on scaled integers:
 * Number arithmetic would reintroduce binary rounding that the schema exists to
 * prevent.
 */
const QUANTITY_SCALE = 4;
const PRICE_SCALE = 2;
const AMOUNT_SCALE = 2;

function toScaled(value: string, scale: number, label: string): bigint {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`${label} must be a non-negative decimal, received "${value}"`);
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > scale) {
    throw new Error(`${label} allows at most ${scale} decimals, received "${value}"`);
  }
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

export function formatAmount(scaled: bigint): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(AMOUNT_SCALE + 1, "0");
  const body = `${digits.slice(0, -AMOUNT_SCALE)}.${digits.slice(-AMOUNT_SCALE)}`;
  return negative ? `-${body}` : body;
}

/** quantity * price, rounded half-up to two decimals (matches SQL round()). */
export function multiplyAmount(quantity: string, price: string): string {
  const scaledQuantity = toScaled(quantity, QUANTITY_SCALE, "Quantity");
  const scaledPrice = toScaled(price, PRICE_SCALE, "Price");
  const product = scaledQuantity * scaledPrice; // scale 6
  const divisor = 10n ** BigInt(QUANTITY_SCALE + PRICE_SCALE - AMOUNT_SCALE);
  return formatAmount((product + divisor / 2n) / divisor);
}

export function sumAmounts(amounts: readonly string[]): string {
  let total = 0n;
  for (const amount of amounts) total += toScaled(amount, AMOUNT_SCALE, "Amount");
  return formatAmount(total);
}
