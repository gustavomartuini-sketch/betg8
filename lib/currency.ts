const FALLBACK_RATE = 83.7;

let cachedRate: number = FALLBACK_RATE;
let lastFetched = 0;

export async function fetchINRRate(): Promise<number> {
  const now = Date.now();
  // Cache for 5 minutes
  if (now - lastFetched < 5 * 60 * 1000) return cachedRate;

  try {
    // Use open exchange rates (no API key needed for USD base)
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 300 }
    });
    const data = await res.json();
    if (data?.rates?.INR) {
      cachedRate = data.rates.INR;
      lastFetched = now;
      return cachedRate;
    }
  } catch {
    // silent fallback
  }
  return FALLBACK_RATE;
}

export function usdcToInr(usdc: number, rate: number = FALLBACK_RATE): number {
  return Math.round(usdc * rate);
}

export function inrToUsdc(inr: number, rate: number = FALLBACK_RATE): number {
  return parseFloat((inr / rate).toFixed(2));
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUsdc(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol}`;
}
