import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CLOB = 'https://clob.polymarket.com';
const BUILDER_ADDRESS = process.env.BUILDER_ADDRESS || '0xE3244A59c302C99690d1d9354dAD7aa154F4a951';
const API_KEY = process.env.POLYMARKET_API_KEY || '';
const SECRET = process.env.POLYMARKET_SECRET || '';
const PASSPHRASE = process.env.POLYMARKET_PASSPHRASE || '';
const MAKER_ADDRESS = '0x1d750079d269c19e4468b6e522fdee811af911bb';
const MAKER_PK = process.env.MAKER_PRIVATE_KEY || '';

function buildAuthHeaders(method: string, path: string, body: string): Record<string, string> {
  if (!API_KEY || !SECRET) return {};
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const msg = timestamp + method.toUpperCase() + path + (body || '');
  const std = SECRET.replace(/-/g, '+').replace(/_/g, '/');
  const sig = crypto.createHmac('sha256', Buffer.from(std, 'base64')).update(msg).digest('base64');
  return {
    'POLY_ADDRESS': MAKER_ADDRESS,
    'POLY_SIGNATURE': sig,
    'POLY_TIMESTAMP': timestamp,
    'POLY_API_KEY': API_KEY,
    'POLY_PASSPHRASE': PASSPHRASE,
  };
}

// Sign order server-side with builder private key
async function signOrder(orderParams: Record<string, unknown>): Promise<string> {
  const { ethers } = await import('ethers');
  const wallet = new ethers.Wallet(MAKER_PK);
  
  const domain = {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId: 137,
    verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
  };
  
  const types = {
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'signer', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'expiration', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'feeRateBps', type: 'uint256' },
      { name: 'side', type: 'uint8' },
      { name: 'signatureType', type: 'uint8' },
    ]
  };
  
  return await wallet._signTypedData(domain, types, orderParams);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenId, side, makerAmount, takerAmount, orderType = 'FOK' } = body;
    
    if (!tokenId || !makerAmount || !takerAmount) {
      return NextResponse.json({ error: 'tokenId, makerAmount, takerAmount required' }, { status: 400 });
    }

    if (!MAKER_PK) {
      return NextResponse.json({ error: 'Server signing not configured' }, { status: 500 });
    }

    const salt = Math.floor(Math.random() * 1e15);
    const sideNum = side === 'BUY' || side === 0 ? 0 : 1;

    const orderParams = {
      salt: salt.toString(),
      maker: MAKER_ADDRESS,
      signer: MAKER_ADDRESS,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: tokenId.toString(),
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      expiration: '0',
      nonce: '0',
      feeRateBps: '50',
      side: sideNum,
      signatureType: 0,
    };

    // Sign server-side with builder private key
    const signature = await signOrder(orderParams);

    const orderPayload = JSON.stringify({
      order: {
        salt,                    // integer
        maker: MAKER_ADDRESS,
        signer: MAKER_ADDRESS,
        taker: '0x0000000000000000000000000000000000000000',
        tokenId: tokenId.toString(),
        makerAmount: makerAmount.toString(),
        takerAmount: takerAmount.toString(),
        expiration: '0',
        nonce: '0',
        feeRateBps: '50',
        side: sideNum === 0 ? 'BUY' : 'SELL',  // string
        signatureType: 0,
        signature,
      },
      owner: API_KEY,
      orderType,
      deferExec: false,
      builderAddress: BUILDER_ADDRESS,
    });

    const headers = buildAuthHeaders('POST', '/order', orderPayload);
    const res = await fetch(`${CLOB}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: orderPayload,
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log('CLOB response:', res.status, text.slice(0, 300));

    if (!res.ok) {
      return NextResponse.json({ error: data.error || data.message || text.slice(0, 300) }, { status: 400 });
    }

    return NextResponse.json({ success: true, orderId: data.orderID || data.id, status: data.status });
  } catch (err) {
    console.error('Order error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const res = await fetch('https://polymarket.com/api/geoblock', {
      headers: ip ? { 'X-Forwarded-For': ip } : {},
    });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ blocked: false });
  }
}
