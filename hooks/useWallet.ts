'use client';

import { useState, useCallback, useEffect } from 'react';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  balance: string | null;
  error: string | null;
}

const POLYGON_CHAIN_ID = 137;

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    balance: null,
    error: null,
  });

  const updateState = (updates: Partial<WalletState>) =>
    setState(prev => ({ ...prev, ...updates }));

  // Check if already connected on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & { ethereum?: MetaMaskProvider };
    if (w.ethereum?.selectedAddress) {
      updateState({
        address: w.ethereum.selectedAddress,
        isConnected: true,
        chainId: parseInt(w.ethereum.chainId || '0', 16),
      });
    }
  }, []);

  const connect = useCallback(async () => {
    const w = window as Window & { ethereum?: MetaMaskProvider };
    if (!w.ethereum) {
      updateState({ error: 'MetaMask not installed. Please install MetaMask or use WalletConnect.' });
      // Open MetaMask install page
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    updateState({ isConnecting: true, error: null });
    try {
      const accounts = await w.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const chainId = await w.ethereum.request({ method: 'eth_chainId' }) as string;
      const chainIdNum = parseInt(chainId, 16);

      updateState({
        address: accounts[0],
        isConnected: true,
        chainId: chainIdNum,
        isConnecting: false,
      });

      // Switch to Polygon if not already
      if (chainIdNum !== POLYGON_CHAIN_ID) {
        await switchToPolygon();
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      updateState({ error: error?.message || 'Failed to connect', isConnecting: false });
    }
  }, []);

  const disconnect = useCallback(() => {
    updateState({ address: null, isConnected: false, chainId: null, balance: null });
  }, []);

  const switchToPolygon = useCallback(async () => {
    const w = window as Window & { ethereum?: MetaMaskProvider };
    if (!w.ethereum) return;
    try {
      await w.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }], // Polygon = 137 = 0x89
      });
    } catch (switchError: unknown) {
      const error = switchError as { code?: number };
      // Chain not added — add it
      if (error?.code === 4902) {
        await w.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x89',
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com/'],
            blockExplorerUrls: ['https://polygonscan.com/'],
          }],
        });
      }
    }
  }, []);

  // Sign a Polymarket order using EIP-712
  const signOrder = useCallback(async (orderData: PolymarketOrderData): Promise<string | null> => {
    const w = window as Window & { ethereum?: MetaMaskProvider };
    if (!w.ethereum || !state.address) return null;

    const domain = {
      name: 'Polymarket CTF Exchange',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
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
      ],
    };

    const makerAmount = Math.round(orderData.size * orderData.price * 1e6); // USDC has 6 decimals
    const takerAmount = Math.round(orderData.size * 1e6);

    const value = {
      salt: Math.floor(Math.random() * 1e15),
      maker: state.address,
      signer: state.address,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: orderData.tokenId,
      makerAmount,
      takerAmount,
      expiration: 0,
      nonce: 0,
      feeRateBps: 0,
      side: orderData.side === 'BUY' ? 0 : 1,
      signatureType: 0,
    };

    try {
      const signature = await w.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [state.address, JSON.stringify({ domain, types, primaryType: 'Order', message: value })],
      });
      return signature as string;
    } catch (err) {
      console.error('Signing failed:', err);
      return null;
    }
  }, [state.address]);

  return { ...state, connect, disconnect, switchToPolygon, signOrder };
}

interface MetaMaskProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  selectedAddress?: string;
  chainId?: string;
}

interface PolymarketOrderData {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
}
