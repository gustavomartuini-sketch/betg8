'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { polygon } from 'viem/chains';
import { createConfig, http } from 'wagmi';

const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [polygon],
  transports: { [polygon.id]: http('https://polygon-rpc.com') },
});

// Privy App ID — replace with yours from dashboard.privy.io
// For now using a placeholder that shows the modal correctly
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'clpispdty00ycl80fpueukbhl';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1',
          logo: 'https://predictindia.vercel.app/favicon.ico',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email', 'google', 'wallet'],
        defaultChain: polygon,
        supportedChains: [polygon],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
