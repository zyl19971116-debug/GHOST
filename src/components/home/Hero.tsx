'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Fingerprint, Radar } from 'lucide-react';
import { GhostGlobeCanvas } from './GhostGlobeCanvas';
import { LiveFeed } from './LiveFeed';
import { getPublicConfig } from '@/lib/config';
import { CHAIN_META, type ChainKey } from '@/lib/chains';
import { formatBlock } from '@/lib/utils';

interface HeadResponse { chainId: number; latestSyncedBlock: number; latestBlockTimestamp: string; }

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-[rgba(182,211,255,0.24)] pl-4 first:border-l-0 first:pl-0">
      <div className="font-display text-[clamp(1.08rem,1.28vw,1.5rem)] font-semibold tabular-nums tracking-wide text-[#f5f8ff]">{value}</div>
      <div className="mt-1.5 font-mono text-[0.61rem] uppercase leading-relaxed tracking-[0.16em] text-[#a0b2d0]">{label}</div>
    </div>
  );
}

export function Hero() {
  const pub = getPublicConfig();
  const reduce = useReducedMotion();
  const chain = pub.defaultChain;
  const chainMeta = CHAIN_META[chain as ChainKey];
  const head = useQuery<HeadResponse>({
    queryKey: ['hero-head', chain],
    queryFn: async () => {
      const res = await fetch(`/api/network/head?chain=${encodeURIComponent(chain)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'unavailable');
      return json.data as HeadResponse;
    },
    refetchInterval: 30_000,
    retry: 1,
  });
  const blockTime = chainMeta?.blocksPerSecond ? `${Math.round((1 / chainMeta.blocksPerSecond) * 1000)} MS` : 'LIVE';

  return (
    <section className="command-hero relative overflow-hidden lg:flex lg:min-h-[520px] lg:flex-1 lg:flex-col">
      <div className="absolute inset-0">
        <Image src="/assets/ghost/command-center.png" alt="" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,12,.93)_0%,rgba(2,5,12,.42)_30%,rgba(2,5,12,.12)_57%,rgba(2,5,12,.64)_78%,rgba(2,5,12,.9)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,5,12,.3)_0%,transparent_20%,transparent_66%,rgba(2,5,12,.9)_100%)]" />
        <div className="absolute inset-y-0 left-0 w-[46%] bg-[linear-gradient(90deg,rgba(3,7,17,.76),rgba(3,7,17,.28)_62%,transparent)]" />
        <div className="command-scan absolute inset-0 opacity-30" />
      </div>

      <div className="relative z-10 mx-auto grid h-full w-[min(94vw,1820px)] grid-cols-1 items-center gap-8 py-12 lg:flex-1 lg:grid-cols-[minmax(320px,.88fr)_minmax(440px,1.32fr)_minmax(320px,.8fr)] lg:gap-5 lg:py-3">
        <motion.div initial={reduce ? undefined : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduce ? 0 : 0.8 }} className="relative z-30 order-1 self-center lg:-mt-10">
          <div className="font-mono text-[0.66rem] uppercase tracking-[0.58em] text-[#a5b5d0]">THE INVISIBLE AI NETWORK</div>
          <h1 className="mt-5 max-w-[680px] font-display text-[clamp(3.15rem,5vw,5.8rem)] font-black uppercase leading-[0.82] tracking-[-0.025em] text-white [text-shadow:0_0_28px_rgba(159,197,255,.18)]">
            <span className="block">GHOST</span><span className="block">PROTOCOL</span>
            <span className="mt-2 inline-flex items-center rounded-lg border border-[#b6d3ff]/70 px-[.18em] py-[.06em] text-[.68em] leading-none shadow-[0_0_28px_rgba(118,175,255,.22),inset_0_0_20px_rgba(118,175,255,.08)]">AI</span>
          </h1>
          <p className="mt-6 font-display text-[clamp(.76rem,1vw,.96rem)] uppercase leading-[1.8] tracking-[0.21em] text-[#d1dced]">EVERY WALLET LEAVES A TRACE.<br />EVERY TRANSACTION TELLS A STORY.</p>
          <div className="mt-3 flex items-center gap-3 font-mono text-[0.58rem] uppercase tracking-[0.29em] text-[#8297bc]"><span>OBSERVE</span><span>·</span><span>ANALYZE</span><span>·</span><span>EXECUTE</span></div>
          <div className="mt-8 flex flex-wrap items-center gap-3 lg:flex-nowrap">
            <Link href="/network" className="focus-ring inline-flex h-[52px] items-center gap-5 bg-[#f5f8ff] px-7 font-display text-[.76rem] font-bold uppercase tracking-[.11em] text-[#0a1120] shadow-[0_8px_30px_rgba(182,211,255,.25)] transition hover:bg-white">ENTER THE NETWORK <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/analyze" className="focus-ring inline-flex h-[52px] items-center gap-3 border border-[#b6d3ff]/45 bg-[#07101e]/55 px-6 font-display text-[.76rem] font-semibold uppercase tracking-[.11em] text-white backdrop-blur-md transition hover:border-[#b6d3ff] hover:bg-[#b6d3ff]/10"><Fingerprint className="h-4 w-4" /> START ANALYSIS</Link>
          </div>
          <div className="mt-8 grid max-w-[520px] grid-cols-3 gap-x-5 border border-[rgba(160,195,255,.24)] bg-[#050b16]/68 px-6 py-[1.125rem] backdrop-blur-md">
            <HeroStat label="LATEST BLOCK" value={head.isError ? 'OFFLINE' : head.data ? formatBlock(head.data.latestSyncedBlock) : 'SYNCING'} />
            <HeroStat label="CHAIN ID" value={head.data ? String(head.data.chainId) : String(chainMeta?.id ?? '—')} />
            <HeroStat label="BLOCK TIME" value={blockTime} />
          </div>
        </motion.div>

        <motion.div initial={reduce ? undefined : { opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduce ? 0 : 1.15 }} className="pointer-events-none relative order-2 mx-auto aspect-[1.12/1] w-[min(96vw,830px)] self-end lg:h-full lg:max-h-[700px] lg:w-full">
          <div className="absolute inset-x-[5%] top-[2%] h-[82%] rounded-full bg-[radial-gradient(circle,rgba(159,197,255,.18),rgba(118,175,255,.06)_45%,transparent_72%)] blur-2xl" />
          <Image src="/assets/ghost/ghost-ai.png" alt="Mechanical hooded AI controlling an on-chain intelligence globe" fill priority sizes="(min-width:1024px) 48vw, 94vw" className="ghost-figure z-10 object-contain object-bottom drop-shadow-[0_0_38px_rgba(159,197,255,.24)]" />
          <div className="absolute left-1/2 top-[64%] z-20 aspect-square w-[31%] -translate-x-1/2"><GhostGlobeCanvas className="absolute inset-0" /></div>
          <div className="absolute left-[18%] top-[48%] z-30 h-px w-[64%] bg-[linear-gradient(90deg,transparent,rgba(182,211,255,.8),transparent)] shadow-[0_0_12px_#76afff]" />
          <div className="absolute left-[25%] top-[61%] z-30 rounded border border-[#b6d3ff]/45 bg-[#030711]/70 px-3 py-2 backdrop-blur-sm"><div className="flex items-center gap-2 font-mono text-[.55rem] uppercase tracking-[.2em] text-[#b6d3ff]"><Radar className="h-3 w-3" /> ANALYZE</div><div className="mt-1 font-mono text-[.45rem] uppercase tracking-[.16em] text-[#8297bc]">GLOBAL VALUE FLOW</div></div>
          <div className="absolute right-[19%] top-[66%] z-30 rounded border border-[#b6d3ff]/45 bg-[#030711]/70 px-3 py-2 backdrop-blur-sm"><div className="font-mono text-[.55rem] uppercase tracking-[.2em] text-[#f5f8ff]">TRACE</div><div className="mt-1 font-mono text-[.45rem] uppercase tracking-[.16em] text-[#8297bc]">ON-CHAIN SIGNALS</div></div>
        </motion.div>

        <motion.aside initial={reduce ? undefined : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduce ? 0 : .8, delay: .15 }} className="relative z-30 order-3 self-center lg:-mt-2">
          <div className="mb-8 hidden border-l border-[#b6d3ff]/25 pl-5 lg:block"><p className="font-display text-[.68rem] uppercase leading-[1.8] tracking-[.13em] text-[#aebdd3]">REAL-WORLD INTELLIGENCE<br />ON-CHAIN EXECUTION<br />A MORE OPEN FUTURE</p><p className="mt-3 font-mono text-[.58rem] uppercase leading-[1.8] tracking-[.18em] text-[#8297bc]">// DECENTRALIZED<br />// PRIVATE<br />// AUTONOMOUS<br />// BORDERLESS</p></div>
          <LiveFeed chainKey={chain} limit={5} className="!min-h-0 h-[clamp(320px,39svh,370px)] max-h-[370px] border-[rgba(160,195,255,.24)] bg-[#0a1120]/78 shadow-[0_22px_70px_-34px_rgba(0,0,0,.95),inset_0_1px_0_rgba(245,248,255,.06)] backdrop-blur-xl" />
        </motion.aside>
      </div>
    </section>
  );
}
