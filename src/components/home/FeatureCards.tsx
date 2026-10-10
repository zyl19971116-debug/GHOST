'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Boxes, Fingerprint, Network, Sparkles } from 'lucide-react';
import { HOME_CARDS } from '@/lib/navigation';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { 'wallet-intelligence': Fingerprint, 'network-explorer': Network, 'ai-analysis': Sparkles, 'onchain-archive': Boxes };

export function FeatureCards() {
  const reduce = useReducedMotion();
  return (
    <section className="relative z-20 -mt-1 shrink-0 border-y border-[rgba(160,195,255,.16)] bg-[#030711]/94 py-4">
      <div className="mx-auto grid w-[min(94vw,1820px)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {HOME_CARDS.map((card, i) => {
          const Icon = ICONS[card.id] ?? Fingerprint;
          return (
            <motion.div key={card.id} initial={reduce ? undefined : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: reduce ? 0 : .45, delay: i * .06 }}>
              <Link href={card.href} className={`feature-card feature-card-${i + 1} focus-ring group relative flex h-[clamp(175px,18svh,196px)] overflow-hidden border border-[rgba(160,195,255,.24)] p-5 transition duration-300 hover:-translate-y-1 hover:border-[#9fc5ff]/80 hover:shadow-[0_0_34px_-12px_rgba(159,197,255,.58)]`}>
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,7,17,.97)_0%,rgba(3,7,17,.82)_58%,rgba(3,7,17,.28)_100%)]" />
                <div className="relative z-10 flex w-[72%] flex-col"><div className="font-display text-xl font-semibold tracking-[.08em] text-[#9fb3d2]">{String(i + 1).padStart(2, '0')}</div><h2 className="mt-4 font-display text-[.91rem] font-bold uppercase tracking-[.065em] text-[#f5f8ff]">{card.title}</h2><p className="mt-2.5 line-clamp-3 text-[.72rem] leading-[1.55] text-[#a0b2d0]">{card.body}</p></div>
                <Icon className="absolute right-[11%] top-1/2 h-16 w-16 -translate-y-1/2 text-[#b6d3ff]/22 transition duration-300 group-hover:scale-110 group-hover:text-[#b6d3ff]/45" />
                <span className="absolute bottom-4 right-4 grid h-7 w-7 place-items-center border border-[#9fc5ff]/50 text-[#e3edff] transition duration-300 group-hover:bg-[#9fc5ff] group-hover:text-[#030711] group-hover:shadow-[0_0_18px_rgba(159,197,255,.55)]"><ArrowUpRight className="h-3.5 w-3.5" /></span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
