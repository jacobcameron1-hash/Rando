import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';

export const metadata: Metadata = {
  title: 'Rando — Automated Holder Lotteries for Bags.fm',
  description:
    'Turn your trading fees into automatic prize draws. Any bags.fm token, fully on-chain, trustless.',
  openGraph: {
    title: 'Rando',
    description: 'Automated holder lotteries powered by bags.fm fee share',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
