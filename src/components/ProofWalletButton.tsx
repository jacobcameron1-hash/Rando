'use client';

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function ProofWalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        style={{
          padding: '12px 18px',
          borderRadius: '8px',
          border: 'none',
          background: '#512da8',
          color: 'white',
          fontWeight: 600,
          opacity: 0.8,
        }}
      >
        Loading Wallet...
      </button>
    );
  }

  return <WalletMultiButton />;
}