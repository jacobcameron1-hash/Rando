import type { Metadata } from 'next';
import { Space_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { SolanaWalletProvider } from '@/components/SolanaWalletProvider';

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-space-mono',
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '900'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rando — Automated Holder Lotteries for Bags.fm',
  description:
    'Turn your trading fees into automatic prize draws. Any bags.fm token, fully on-chain, trustless.',
  openGraph: {
    title: 'Rando',
    description: 'Automated holder lotteries powered by bags.fm fee share',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${playfairDisplay.variable}`}
    >
      <body>
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
      </body>
    </html>
  );
}