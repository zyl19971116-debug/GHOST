'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Menu, Radio, X } from 'lucide-react';
import { Wordmark } from './Logo';
import { WalletButton } from '@/components/wallet/WalletButton';
import { NAV_ITEMS } from '@/lib/navigation';
import { getPublicConfig } from '@/lib/config';
import { CHAIN_META, type ChainKey } from '@/lib/chains';
import { cn } from '@/lib/utils';

interface HeadResponse {
  chainKey: string;
  chainName: string;
  chainId: number;
  latestSyncedBlock: number;
  latestBlockTimestamp: string;
  sourceHost: string;
  latencyMs: number;
}

/**
 * Real chain telemetry for the header marker. Reads the deployment's configured
 * RPC through our own API so the number shown is a live block height, never a
 * placeholder. When the upstream cannot be read we say so instead of inventing
 * a value.
 */
function useChainMarker() {
  const pub = getPublicConfig();
  const chain = pub.defaultChain;
  const query = useQuery<HeadResponse>({
    queryKey: ['head', chain],
    queryFn: async () => {
      const res = await fetch(`/api/network/head?chain=${encodeURIComponent(chain)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Chain head unavailable');
      return json.data as HeadResponse;
    },
    refetchInterval: 30_000,
    retry: 1,
  });
  return { chain, ...query };
}

export function Header() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const head = useChainMarker();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const chainMeta = CHAIN_META[head.chain as ChainKey];

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all duration-300',
        scrolled ? 'border-b border-[rgba(182,211,255,0.18)] bg-[rgba(2,5,12,0.9)] backdrop-blur-xl' : 'border-b border-[rgba(182,211,255,0.14)] bg-[rgba(2,5,12,0.66)] backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-[68px] w-[min(94vw,1820px)] items-center gap-2 sm:gap-4">
        {/* Logo */}
        <Link href="/" className="focus-ring shrink-0" aria-label="GHOST PROTOCOL AI — home">
          <Wordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="mx-auto hidden items-center gap-3 xl:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'focus-ring group relative px-3 py-2 font-display text-[0.74rem] font-semibold uppercase tracking-[0.12em] transition-colors',
                  active ? 'text-ice' : 'text-muted hover:text-ghost',
                )}
              >
                {item.label}
                {active ? (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-2 -bottom-0.5 h-px bg-ice shadow-[0_0_12px_rgba(141,190,255,1)]"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-3 xl:ml-0">
          <div className="hidden items-center gap-2.5 border border-[rgba(160,195,255,0.24)] bg-[rgba(3,7,17,0.62)] px-3 py-2 xl:flex">
            <Radio
              className={cn(
                'h-3 w-3',
                head.isError ? 'text-[#FCD34D]' : head.isLoading ? 'text-muted' : 'text-[#4ADE80]',
              )}
            />
            <div className="leading-none">
              <div className="font-mono text-[0.625rem] uppercase tracking-wide2 text-ghost">
                {chainMeta?.shortName ?? head.chain.toUpperCase()}
              </div>
              <div className="mt-0.5 font-mono text-[0.5625rem] text-muted">
                {head.isError
                  ? 'FEED UNAVAILABLE'
                  : head.data
                    ? `BLOCK ${head.data.latestSyncedBlock.toLocaleString('en-US')}`
                    : 'SYNCING…'}
              </div>
            </div>
          </div>

          <WalletButton className="hidden sm:block" />

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="focus-ring text-muted transition-colors hover:text-ice xl:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <motion.nav
          initial={reduce ? undefined : { opacity: 0, y: -8 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          className="border-t border-[rgba(141,190,255,0.14)] bg-[rgba(5,9,19,0.97)] backdrop-blur-xl xl:hidden"
          aria-label="Mobile"
        >
          <div className="container max-w-[1600px] py-3">
            <div className="mb-2 sm:hidden">
              <WalletButton />
            </div>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'focus-ring flex items-center justify-between border-b border-[rgba(141,190,255,0.08)] py-3 last:border-b-0',
                  isActive(item.href) ? 'text-ice' : 'text-ghost',
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[0.625rem] tracking-hud text-[rgba(141,190,255,0.5)]">{item.code}</span>
                  <span className="font-display text-sm font-semibold uppercase tracking-hud">{item.label}</span>
                </span>
                <span className="max-w-[52%] truncate text-right text-[0.6875rem] text-muted">{item.description}</span>
              </Link>
            ))}
            <div className="flex items-center gap-2 pt-3">
              <Radio className={cn('h-3 w-3', head.isError ? 'text-[#FCD34D]' : 'text-[#4ADE80]')} />
              <span className="font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">
                {head.isError
                  ? `${head.chain.toUpperCase()} · FEED UNAVAILABLE`
                  : head.data
                    ? `${head.chain.toUpperCase()} · BLOCK ${head.data.latestSyncedBlock.toLocaleString('en-US')}`
                    : `${head.chain.toUpperCase()} · SYNCING`}
              </span>
            </div>
          </div>
        </motion.nav>
      ) : null}
    </header>
  );
}
