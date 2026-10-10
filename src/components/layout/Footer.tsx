import Link from 'next/link';
import { GhostMark } from './Logo';

export function Footer() {
  return (
    <footer className="relative border-t border-[rgba(182,211,255,0.1)] bg-[#02050b]">
      <div className="mx-auto flex min-h-[88px] w-[min(94vw,1820px)] flex-col justify-center gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <GhostMark size={25} />
          <span className="font-display text-[.72rem] font-bold uppercase tracking-[.12em] text-white">GHOST PROTOCOL <span className="text-[#9cb7dc]">AI</span></span>
          <span className="hidden h-4 w-px bg-[#b6d3ff]/25 sm:block" />
          <span className="hidden font-mono text-[.54rem] uppercase tracking-[.3em] text-[#62728e] sm:block">THE INVISIBLE AI NETWORK</span>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[.55rem] uppercase tracking-[.1em] text-[#62728e]" aria-label="Footer">
          <Link className="transition hover:text-[#b6d3ff]" href="/docs">DOCS</Link>
          <Link className="transition hover:text-[#b6d3ff]" href="/archive">ARCHIVE</Link>
          <Link className="transition hover:text-[#b6d3ff]" href="/intel">INTEL</Link>
          <Link className="transition hover:text-[#b6d3ff]" href="/settings">SETTINGS</Link>
        </nav>
      </div>
    </footer>
  );
}
