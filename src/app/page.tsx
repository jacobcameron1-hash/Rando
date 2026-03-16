import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <a
          href="https://randocoin.netlify.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity"
        >
          🎲 Rando
        </a>
        <div className="flex items-center gap-3">
          <a
            href="https://randocoin.netlify.app"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity hidden sm:block"
            style={{ color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)' }}
          >
            $RANDO
          </a>
          <Link
            href="/setup"
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ background: 'var(--accent)' }}
          >
            Launch a Lottery
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div
          className="w-24 h-24 rounded-full mb-8 flex items-center justify-center text-5xl"
          style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}
        >
          🎲
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 max-w-3xl">
          Turn your trading fees into{' '}
          <span style={{ color: 'var(--accent)' }}>prize draws</span>
        </h1>
        <p className="text-lg max-w-xl mb-4" style={{ color: 'var(--muted)' }}>
          Rando automatically pools trading fees from your bags.fm token and
          rewards a randomly selected eligible holder — on a configurable timer,
          fully verifiable on-chain.
        </p>
        <p className="text-sm mb-10" style={{ color: 'var(--muted)' }}>
          Powered by{' '}
          <a
            href="https://randocoin.netlify.app"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
            style={{ color: 'var(--accent-gold)' }}
          >
            $RANDO
          </a>{' '}
          · the original holder lottery coin
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/setup"
            className="px-8 py-3 rounded-xl text-white font-semibold text-lg transition-all hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Set up Rando →
          </Link>
          <a
            href="#how-it-works"
            className="px-8 py-3 rounded-xl font-semibold text-lg transition-all hover:opacity-70"
            style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            How it works
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-20 max-w-5xl mx-auto w-full">
        <h2 className="text-3xl font-bold text-center mb-14">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: 'Fees accumulate',
              body: 'Every trade on your bags.fm token generates a 1% fee. Rando captures a share of those fees into a dedicated prize vault — no manual top-ups needed.',
            },
            {
              step: '02',
              title: 'Timer fires',
              body: 'On your configurable schedule — flat or progressive — Rando checks the holder list. Only wallets that held the minimum amount for the entire interval are eligible.',
            },
            {
              step: '03',
              title: 'Winner gets paid',
              body: 'A random eligible holder is selected, weighted by balance. The full prize pool lands in their wallet automatically. Paper hands miss out. Diamond hands get paid.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-2xl p-6"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="text-sm font-mono mb-3" style={{ color: 'var(--accent)' }}>
                {item.step}
              </div>
              <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 border-t border-[var(--border)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-14">Built for launchers</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: '⏱',
                title: 'Progressive timers',
                body: 'Start with quick draws to build early hype, then slow down automatically as the community matures. Configure base interval, increment, and cap.',
              },
              {
                icon: '🔒',
                title: 'Trustless lock mode',
                body: 'Permanently transfer fee share admin to the system program. On-chain verifiable — no one can ever rug the prize split again.',
              },
              {
                icon: '🎯',
                title: 'Flexible eligibility',
                body: 'Set the minimum hold requirement as a % of total supply or a raw token amount. Holders who sold before the draw end are automatically excluded.',
              },
              {
                icon: '📊',
                title: 'Full transparency',
                body: 'Every draw is recorded with the winner wallet, prize amount, and transaction signature. Anyone can verify the results on-chain, anytime.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="flex gap-4 rounded-2xl p-6"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <span className="text-2xl">{f.icon}</span>
                <div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center border-t border-[var(--border)]">
        <h2 className="text-3xl font-bold mb-4">Ready to reward your holders?</h2>
        <p className="mb-8" style={{ color: 'var(--muted)' }}>
          Two minutes to set up. Automatic forever after.
        </p>
        <Link
          href="/setup"
          className="inline-block px-10 py-4 rounded-xl text-white font-semibold text-lg hover:opacity-90 transition-opacity"
          style={{ background: 'var(--accent)' }}
        >
          Set up Rando →
        </Link>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-[var(--border)] text-center text-sm" style={{ color: 'var(--muted)' }}>
        Built on{' '}
        <a
          href="https://bags.fm"
          className="underline hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          bags.fm
        </a>{' '}
        · Powered by{' '}
        <a
          href="https://randocoin.netlify.app"
          className="underline hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-gold)' }}
        >
          $RANDO
        </a>{' '}
        · Rando
      </footer>
    </main>
  );
}
