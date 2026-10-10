'use client';

import * as React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi';
import { Check, ChevronDown, Copy, LogOut, RefreshCw, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPublicConfig } from '@/lib/config';
import { CHAIN_META, type ChainKey } from '@/lib/chains';
import { cn, shortenAddress } from '@/lib/utils';

/**
 * Wallet control surface.
 *
 * Everything here is a real wagmi action: connect via any injected wallet,
 * switch account inside the wallet itself, switch chain through wagmi's
 * `switchChain`, refresh reads through `refetch`, and disconnect.
 *
 * The app never requests a private key or seed phrase and never sends a
 * transaction as part of connecting.
 */
export function WalletButton({ className }: { className?: string }) {
  const pub = getPublicConfig();
  const { address, isConnected, connector, chain } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { connectors, connect, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const balance = useBalance({ address, query: { enabled: Boolean(address) } });

  const [open, setOpen] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open && !connectOpen) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConnectOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setConnectOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, connectOpen]);

  const availableChains = pub.chains.map((k: ChainKey) => CHAIN_META[k]);
  const activeChainMeta = availableChains.find((c) => c.id === chainId) ?? null;

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  // --- Disconnected: show a real connect menu ---------------------------------
  if (!isConnected || !address) {
    return (
      <div className={cn('relative', className)} ref={panelRef}>
        <Button
          variant="primary"
          size="sm"
          clip
          onClick={() => setConnectOpen((v) => !v)}
          aria-expanded={connectOpen}
          aria-haspopup="menu"
        >
          <Wallet className="h-3.5 w-3.5" />
          CONNECT WALLET
        </Button>

        {connectOpen ? (
          <div className="glass-strong hud-corners absolute right-0 top-[calc(100%+8px)] z-50 w-[286px] p-3">
            <div className="hud-label mb-2.5">SELECT CONNECTOR</div>
            <div className="flex flex-col gap-1.5">
              {connectors.length === 0 ? (
                <p className="px-1 py-3 text-xs leading-relaxed text-muted">
                  No browser wallet was detected. Install MetaMask or Rabby, then reload this page.
                </p>
              ) : (
                connectors.map((c) => (
                  <button
                    key={c.uid}
                    type="button"
                    onClick={() => {
                      connect({ connector: c });
                      setConnectOpen(false);
                    }}
                    disabled={isPending}
                    className="focus-ring flex items-center justify-between border border-[rgba(141,190,255,0.16)] bg-[rgba(3,6,13,0.5)] px-3 py-2.5 text-left transition-colors hover:border-[rgba(141,190,255,0.5)] hover:bg-[rgba(141,190,255,0.09)] disabled:opacity-50"
                  >
                    <span className="font-mono text-xs uppercase tracking-wide2 text-ghost">{c.name}</span>
                    <Badge tone={c.type === 'injected' ? 'ice' : 'neutral'}>
                      {c.type === 'injected' ? 'INJECTED' : c.type.toUpperCase()}
                    </Badge>
                  </button>
                ))
              )}
            </div>

            {!pub.features.walletConnect ? (
              <p className="mt-3 border-t border-[rgba(141,190,255,0.12)] pt-2.5 text-[0.6875rem] leading-relaxed text-muted">
                WalletConnect is not listed because <span className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span>{' '}
                is not set for this deployment.
              </p>
            ) : null}

            <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-muted">
              Connecting only shares your public address. No private key or seed phrase is ever requested, and no
              transaction is sent automatically.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  // --- Connected --------------------------------------------------------------
  return (
    <div className={cn('relative', className)} ref={panelRef}>
      <div className="flex items-center gap-2">
        {/* Network marker */}
        <div className="hidden items-center gap-2 border border-[rgba(141,190,255,0.2)] bg-[rgba(3,6,13,0.6)] px-2.5 py-[7px] lg:flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ADE80] opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
          </span>
          <span className="font-mono text-[0.625rem] uppercase tracking-wide2 text-ghost">
            {activeChainMeta?.shortName ?? `CHAIN ${chainId}`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="focus-ring flex items-center gap-2 border border-[rgba(141,190,255,0.38)] bg-[rgba(141,190,255,0.1)] px-3 py-2 transition-colors hover:border-[rgba(141,190,255,0.75)] hover:bg-[rgba(141,190,255,0.17)]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ice shadow-[0_0_10px_rgba(141,190,255,1)]" />
          <span className="font-mono text-[0.6875rem] uppercase tracking-wide2 text-ghost">
            {connector?.name ?? 'WALLET'}
          </span>
          <span className="font-mono text-[0.6875rem] text-muted">{shortenAddress(address)}</span>
          <ChevronDown className={cn('h-3 w-3 text-muted transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open ? (
        <div className="glass-strong hud-corners absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="hud-label">CONNECTED</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xs text-ghost">{connector?.name ?? 'Unknown connector'}</span>
                <Badge tone="ok">ACTIVE</Badge>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring text-muted transition-colors hover:text-ice"
              aria-label="Close wallet panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 border border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)] px-3 py-2.5">
            <div className="hud-label">ADDRESS</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="break-all font-mono text-[0.6875rem] text-ghost">{address}</span>
              <button
                type="button"
                onClick={copyAddress}
                className="focus-ring shrink-0 text-muted transition-colors hover:text-ice"
                aria-label="Copy address"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#7EE2A8]" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)] px-3 py-2">
              <dt className="hud-label">NETWORK</dt>
              <dd className="mt-1 font-mono text-[0.6875rem] text-ghost">
                {chain?.name ?? activeChainMeta?.name ?? `Chain ${chainId}`}
              </dd>
              <dd className="font-mono text-[0.625rem] text-muted">ID {chainId}</dd>
            </div>
            <div className="border border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)] px-3 py-2">
              <dt className="hud-label">BALANCE</dt>
              <dd className="mt-1 font-mono text-[0.6875rem] text-ghost">
                {balance.isLoading
                  ? '…'
                  : balance.data
                    ? `${Number(balance.data.formatted).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${balance.data.symbol}`
                    : 'UNAVAILABLE'}
              </dd>
              <dd className="font-mono text-[0.625rem] text-muted">
                {balance.isError ? 'read failed' : balance.data ? 'at latest block' : '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-3">
            <div className="hud-label mb-2">SWITCH NETWORK</div>
            <div className="flex flex-wrap gap-1.5">
              {availableChains.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={switching || c.id === chainId}
                  onClick={() => switchChain({ chainId: c.id })}
                  className={cn(
                    'focus-ring border px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-wide2 transition-colors',
                    c.id === chainId
                      ? 'border-[rgba(141,190,255,0.6)] bg-[rgba(141,190,255,0.16)] text-ice'
                      : 'border-[rgba(141,190,255,0.18)] text-muted hover:border-[rgba(141,190,255,0.45)] hover:text-ghost',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  {c.shortName}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                void balance.refetch();
              }}
              loading={balance.isFetching}
            >
              <RefreshCw className="h-3 w-3" />
              REFRESH
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              <LogOut className="h-3 w-3" />
              DISCONNECT
            </Button>
          </div>

          <p className="mt-3 border-t border-[rgba(141,190,255,0.12)] pt-2.5 text-[0.625rem] leading-relaxed text-muted">
            Switching account happens inside your wallet. Signatures are used only to prove address ownership; this app
            never signs or sends a transaction on your behalf.
          </p>
        </div>
      ) : null}
    </div>
  );
}
