// Builder config
export const BUILDER_FEE_BPS = 50; // 0.5%
export const BUILDER_ADDRESS = process.env.NEXT_PUBLIC_BUILDER_ADDRESS || '0xE3244A59c302C99690d1d9354dAD7aa154F4a951';

// Polymarket Exchange contract on Polygon
export const EXCHANGE_CONTRACT = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
// USDC on Polygon (USDC.e / bridged)
export const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// USDC native on Polygon
export const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

// Build order params for CLOB
export function buildOrderParams({
  tokenId, side, price, size, makerAddress, signatureType = 0
}: {
  tokenId: string; side: 'BUY' | 'SELL'; price: number; size: number;
  makerAddress: string; signatureType?: number;
}) {
  // For BUY: makerAmount = USDC spent, takerAmount = shares received
  const makerAmount = Math.round(size * 1e6); // USDC 6 decimals
  const takerAmount = Math.round((size / price) * 1e6); // shares

  return {
    salt: Math.floor(Math.random() * 1e15).toString(),
    maker: makerAddress,
    signer: makerAddress,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId,
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    expiration: '0',
    nonce: '0',
    feeRateBps: BUILDER_FEE_BPS.toString(),
    side: side === 'BUY' ? 0 : 1,
    signatureType, // 0 = EOA, 2 = Privy embedded wallet (EIP-1271)
  };
}

export function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function formatInr(usd: number, rate: number): string {
  return `₹${Math.round(usd * rate).toLocaleString('en-IN')}`;
}

export function getFallbackMarkets() { return []; }
