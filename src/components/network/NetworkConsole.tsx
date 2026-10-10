'use client';

import * as React from 'react';
import { Copy, Crosshair, ExternalLink, GitBranch, Loader2, Play, RotateCcw, Search, X } from 'lucide-react';
import { GraphView2D, GraphView3D } from './GraphViews';
import { HolographicIdleScene } from './HolographicIdleScene';
import { CHAIN_META, explorerAddressUrl, explorerTxUrl, type ChainKey } from '@/lib/chains';
import { cn, formatEth, shortenAddress, shortenHash } from '@/lib/utils';
import type { AnalysisReport, RelationshipEdge, RelationshipNode } from '@/lib/types';

type KindFilter = 'all' | 'counterparty' | 'contract' | 'hop2';
type Props = {
  chains: ChainKey[]; chain: string; setChain: (v: string) => void;
  address: string; setAddress: (v: string) => void; valid: boolean; run: () => void;
  hops: number; setHops: (v: number) => void; view: '2d' | '3d'; setView: (v: '2d' | '3d') => void;
  walletFilter: string; setWalletFilter: (v: string) => void;
  kindFilter: KindFilter; setKindFilter: (v: KindFilter) => void;
  minConfidence: number; setMinConfidence: (v: number) => void;
  pending: boolean; error: string | null; retry: () => void;
  report: AnalysisReport | undefined; nodes: RelationshipNode[]; edges: RelationshipEdge[];
  visibleEdges: RelationshipEdge[]; filterSet: Set<string>;
  selected: string | null; setSelected: (v: string | null) => void;
  selectedNode: RelationshipNode | null; selectedEdges: RelationshipEdge[];
};

const control = 'h-11 w-full border border-[rgba(166,201,255,.22)] bg-[#050c18]/85 px-3 font-mono text-[.7rem] text-[#f5f8ff] outline-none transition focus:border-[#a6c9ff]/70';

export function NetworkConsole(p: Props) {
  const chainMeta = CHAIN_META[p.chain as ChainKey];
  const resetFilters = () => { p.setWalletFilter(''); p.setKindFilter('all'); p.setMinConfidence(0); };
  const indexedSource = p.report?.dataSources.find((source) => source.strategy === 'explorer-indexer');
  const scannedBlocks = p.report?.dataSources
    .filter((source) => source.strategy === 'rpc-block-scan' || source.strategy === 'rpc-logs')
    .reduce((sum, source) => sum + (source.blocksScanned ?? 0), 0);
  const coverage = indexedSource ? 'INDEXED HISTORY' : scannedBlocks ? `${scannedBlocks.toLocaleString()} BLOCKS` : 'NOT LOADED';
  const flow = p.report?.stats.flow;

  return (
    <main className="network-page min-h-[calc(100svh-68px)] bg-[#030711] pb-5 text-[#f5f8ff]">
      <div className="mx-auto w-[94vw] pt-5">
        <header className="mb-4 flex flex-col gap-4 border-b border-[rgba(166,201,255,.14)] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-5">
            <h1 className="font-display text-[clamp(1.45rem,6.8vw,2.75rem)] font-black uppercase tracking-[.08em] sm:whitespace-nowrap sm:tracking-[.1em]"><span className="mr-2 text-[#6baaff] sm:mr-4">//</span>NETWORK EXPLORER</h1>
            <p className="hidden border-l border-[rgba(166,201,255,.2)] pl-5 font-mono text-[.57rem] uppercase leading-[1.7] tracking-[.15em] text-[#9bafcc] md:block">VISUALIZE ON-CHAIN RELATIONSHIPS.<br/>TRACE FUNDS. DISCOVER PATTERNS.<br/>UNCOVER THE INVISIBLE NETWORK.</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[rgba(166,201,255,.16)] border-l border-[rgba(166,201,255,.16)] font-mono">
            <TopStat label="TOTAL NODES" value={p.report ? p.nodes.length.toLocaleString() : '—'} />
            <TopStat label="TOTAL EDGES" value={p.report ? p.edges.length.toLocaleString() : '—'} />
            <TopStat label="DATA COVERAGE" value={coverage} />
          </div>
        </header>

        <div className="grid items-stretch gap-2.5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside className="network-panel network-workspace-height order-2 overflow-y-auto xl:order-1">
            <PanelTitle title="GRAPH CONTROL" />
            <div className="space-y-5 p-4">
              <Field label="NETWORK SELECTOR">
                <select value={p.chain} onChange={(e)=>p.setChain(e.target.value)} className={control}>{p.chains.map(k=><option key={k} value={k}>{CHAIN_META[k].shortName} · {CHAIN_META[k].id}</option>)}</select>
              </Field>
              <Field label="SUBJECT WALLET">
                <input id="network-wallet" value={p.address} onChange={(e)=>p.setAddress(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&p.valid&&p.run()} placeholder="0x… Enter wallet address" className={cn(control,'h-12',p.address&&!p.valid&&'border-red-400/60')} />
              </Field>
              <button onClick={p.run} disabled={!p.valid||p.pending} className="network-primary h-12 w-full disabled:cursor-not-allowed disabled:opacity-40">{p.pending?<><Loader2 className="h-4 w-4 animate-spin"/>SCANNING BLOCKCHAIN</>:<><Play className="h-4 w-4"/>BUILD GRAPH</>}</button>
              <Range label="RELATIONSHIP DEPTH" value={p.hops} display={`${p.hops} HOP${p.hops>1?'S':''}`} min={1} max={3} step={1} onChange={p.setHops} ticks={['1','2','3']} />
              <Field label="WALLET FILTER">
                <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9bafcc]"/><input value={p.walletFilter} onChange={(e)=>p.setWalletFilter(e.target.value)} placeholder="Filter by address" className={cn(control,'pl-9')} /></div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">{([['all','ALL'],['counterparty','EOA'],['contract','CONTRACTS'],['hop2','HOP-2+']] as const).map(([id,label])=><button key={id} onClick={()=>p.setKindFilter(id)} className={cn('h-8 border font-mono text-[.58rem] tracking-[.12em] transition',p.kindFilter===id?'border-[#a6c9ff]/70 bg-[#6baaff]/20 text-white':'border-[#a6c9ff]/15 text-[#9bafcc] hover:border-[#a6c9ff]/40')}>{label}</button>)}</div>
              </Field>
              <Range label="MIN EDGE CONFIDENCE" value={p.minConfidence*100} display={`${Math.round(p.minConfidence*100)}%`} min={0} max={90} step={5} onChange={(v)=>p.setMinConfidence(v/100)} ticks={['0%','45%','90%']} />
              <Field label="VIEW MODE"><div className="grid grid-cols-2 gap-1.5"><Mode active={p.view==='2d'} onClick={()=>p.setView('2d')}>2D GRAPH</Mode><Mode active={p.view==='3d'} onClick={()=>p.setView('3d')}>3D SCENE</Mode></div></Field>
              <button onClick={resetFilters} className="flex h-10 w-full items-center justify-center gap-2 border border-[#a6c9ff]/25 font-mono text-[.62rem] tracking-[.14em] text-[#c7d8ef] transition hover:border-[#a6c9ff]/65 hover:bg-[#6baaff]/10"><RotateCcw className="h-3.5 w-3.5"/>RESET FILTERS</button>
            </div>
          </aside>

          <section className="order-1 flex min-w-0 flex-col xl:order-2">
            <div className="network-canvas network-canvas-height relative h-[520px] overflow-hidden sm:h-[620px]">
              <div className="absolute right-3 top-3 z-30 flex gap-1.5"><Mode active={p.view==='2d'} onClick={()=>p.setView('2d')}>2D GRAPH</Mode><Mode active={p.view==='3d'} onClick={()=>p.setView('3d')}>3D SCENE</Mode></div>
              {p.error ? <State icon={X} title="GRAPH BUILD FAILED" body={p.error}><button className="network-primary mt-5 h-10 px-6" onClick={p.retry}>RETRY</button></State>
              : p.pending ? <State icon={Crosshair} title="SCANNING BLOCKCHAIN" body="Reading the configured chain window and laying out observed relationships. No estimated percentage is shown." loading />
              : p.nodes.length<=1 ? <Idle onStart={()=>document.getElementById('network-wallet')?.focus()} hasReport={Boolean(p.report)} />
              : p.view==='2d' ? <GraphView2D nodes={p.nodes} edges={p.visibleEdges} subject={p.report?.subject??null} selected={p.selected} onSelect={p.setSelected} highlighted={p.filterSet}/>
              : <GraphView3D nodes={p.nodes} edges={p.visibleEdges} subject={p.report?.subject??null} selected={p.selected} onSelect={p.setSelected} highlighted={p.filterSet}/>}
            </div>
            <div className="grid grid-cols-2 border-x border-b border-[rgba(166,201,255,.2)] bg-[#07101d]/95 sm:grid-cols-5">
              <BottomStat label="TOTAL NODES" value={p.report?String(p.nodes.length):'—'}/><BottomStat label="TOTAL EDGES" value={p.report?String(p.visibleEdges.length):'—'}/><BottomStat label="RELATIONSHIP DEPTH" value={p.report?`${p.hops} HOP`:'—'}/><BottomStat label="LAST SYNC" value={p.report?new Date(p.report.createdAt).toLocaleTimeString():'NOT LOADED'}/><BottomStat label="DATA COVERAGE" value={coverage}/>
            </div>
          </section>

          <aside className="network-panel network-workspace-height order-3 min-h-[360px] overflow-y-auto">
            <PanelTitle title="NODE INSPECTOR" />
            {p.selectedNode ? <Inspector node={p.selectedNode} edges={p.selectedEdges} report={p.report} chain={p.chain} onClose={()=>p.setSelected(null)} /> : <div className="flex min-h-[420px] flex-col items-center justify-center px-7 text-center"><div className="network-orb mb-6 h-20 w-20"><Crosshair className="h-7 w-7"/></div><h2 className="font-display text-lg font-bold tracking-[.16em]">SELECT A NODE</h2><p className="mt-3 max-w-[240px] text-xs leading-6 text-[#9bafcc]">Click any wallet or contract node to inspect its on-chain relationships.</p><div className="mt-8 w-full space-y-2 border-t border-[#a6c9ff]/10 pt-5 text-left">{[['SUBJECT WALLET','#a6c9ff'],['COUNTERPARTY (EOA)','#d9e8ff'],['CONTRACT','#9d7cff'],['HOP-2+ WALLET','#6f8dbd']].map(([x,c])=><div key={x} className="flex items-center gap-3 font-mono text-[.6rem] tracking-[.1em] text-[#9bafcc]"><span className="h-2 w-2 rounded-full" style={{background:c}}/>{x}</div>)}</div></div>}
          </aside>
        </div>

        <details className="network-panel mt-2.5 group"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4"><div><span className="mr-4 text-[#6baaff]">◌</span><span className="font-display text-sm font-bold tracking-[.16em]">HOW THE GRAPH IS BUILT</span><span className="ml-5 hidden text-xs text-[#9bafcc] md:inline">Constructed only from indexed or directly observed on-chain transactions.</span></div><span className="font-mono text-[.6rem] text-[#9bafcc] group-open:rotate-180">⌄</span></summary><div className="border-t border-[#a6c9ff]/10 px-6 py-4 text-xs leading-6 text-[#9bafcc]">The deterministic engine groups verifiable transactions into counterparties and scores each relationship. Robinhood mainnet uses the Blockscout address index when reachable and a bounded RPC scan as fallback. Every relationship keeps transaction hashes for explorer verification.</div></details>
      </div>
    </main>
  );
}

function PanelTitle({title}:{title:string}){return <div className="border-b border-[#a6c9ff]/15 bg-[linear-gradient(90deg,rgba(107,170,255,.11),transparent)] px-4 py-3 font-display text-xs font-bold tracking-[.17em] text-[#dce9fb]">⌘ <span className="ml-2">{title}</span></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-2 block font-mono text-[.62rem] tracking-[.14em] text-[#b8cae3]">{label}</span>{children}</label>}
function Range({label,value,display,min,max,step,onChange,ticks}:{label:string;value:number;display:string;min:number;max:number;step:number;onChange:(v:number)=>void;ticks:string[]}){return <Field label={label}><div className="flex items-center gap-3"><input className="network-range min-w-0 flex-1" type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))}/><span className="w-12 border border-[#a6c9ff]/25 bg-[#07101d] py-2 text-center font-mono text-[.62rem] text-white">{display}</span></div><div className="mt-1 flex justify-between pr-14 font-mono text-[.52rem] text-[#6f84a5]">{ticks.map(x=><span key={x}>{x}</span>)}</div></Field>}
function Mode({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}){return <button onClick={onClick} className={cn('h-9 border px-4 font-mono text-[.6rem] tracking-[.13em] transition',active?'border-[#7fb5ff] bg-[#6baaff]/20 text-white shadow-[0_0_18px_rgba(107,170,255,.18)]':'border-[#a6c9ff]/20 bg-[#050b15]/85 text-[#9bafcc] hover:border-[#a6c9ff]/50')}>{children}</button>}
function TopStat({label,value}:{label:string;value:string|number}){return <div className="min-w-0 px-2 sm:min-w-[120px] sm:px-5"><div className="break-words font-display text-sm font-bold text-[#a6c9ff] sm:text-base">{value}</div><div className="mt-1 text-[.45rem] tracking-[.08em] text-[#7890b1] sm:text-[.52rem] sm:tracking-[.13em]">{label}</div></div>}
function BottomStat({label,value}:{label:string;value:string}){return <div className="border-r border-[#a6c9ff]/10 px-4 py-3"><div className="font-mono text-[.5rem] tracking-[.14em] text-[#7890b1]">{label}</div><div className="mt-1 font-display text-sm font-bold text-[#eaf2ff]">{value}</div></div>}
function State({icon:Icon,title,body,loading,children}:{icon:typeof X;title:string;body:string;loading?:boolean;children?:React.ReactNode}){return <div className="flex h-full flex-col items-center justify-center px-8 text-center"><div className={cn('network-orb mb-6 h-24 w-24',loading&&'animate-pulse')}><Icon className="h-8 w-8"/></div><h2 className="font-display text-xl font-bold tracking-[.16em]">{title}</h2><p className="mt-3 max-w-md text-xs leading-6 text-[#9bafcc]">{body}</p>{children}</div>}
function Idle({onStart,hasReport}:{onStart:()=>void;hasReport:boolean}){return <div className="network-idle relative h-full overflow-hidden"><HolographicIdleScene/><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(3,7,17,.06)_40%,rgba(3,7,17,.72)_82%)]"/><div className="relative z-10 flex h-full flex-col items-center justify-end px-8 pb-10 text-center sm:pb-12"><div className="mb-2 border border-[#a6c9ff]/25 bg-[#06101d]/72 px-3 py-1.5 font-mono text-[.55rem] tracking-[.2em] text-[#8ebcff] backdrop-blur-md">AWAITING WALLET INPUT</div><h2 className="font-display text-xl font-bold tracking-[.16em] [text-shadow:0_2px_18px_#030711]">{hasReport?'NO RELATIONSHIPS OBSERVED':'HOLOGRAPHIC INTELLIGENCE CORE'}</h2><p className="mt-2 max-w-lg text-xs leading-5 text-[#9bafcc] [text-shadow:0_2px_12px_#030711]">{hasReport?'No counterparty relationships were observed in the bounded real-data scan. Decorative visualization only.':'Decorative visualization. No wallet data loaded.'}</p><button onClick={onStart} className="network-primary pointer-events-auto mt-4 h-11 px-7">START EXPLORING</button></div></div>}
function Inspector({node,edges,report,chain,onClose}:{node:RelationshipNode;edges:RelationshipEdge[];report?:AnalysisReport;chain:string;onClose:()=>void}){const flow=node.kind==='subject'?report?.stats.flow:null;const recent=[...edges].sort((a,b)=>b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0,5);const tokens=node.tokenActivity??edges.flatMap(e=>e.tokenTransfers??[]).filter((e,i,a)=>a.findIndex(x=>x.transactionHash===e.transactionHash&&x.logIndex===e.logIndex)===i);return <div className="p-4"><div className="flex justify-between gap-3"><div><div className="font-display text-lg font-bold">{shortenAddress(node.address,8,6)}</div><div className="mt-2 flex gap-2"><Tag>{node.kind.toUpperCase()}</Tag><Tag>DEPTH {node.depth}</Tag></div></div><button onClick={onClose} aria-label="Close inspector"><X className="h-4 w-4 text-[#9bafcc]"/></button></div><div className="mt-4 flex items-start gap-2 border border-[#a6c9ff]/15 bg-[#050c18]/70 p-3"><div className="min-w-0 flex-1 break-all font-mono text-[.62rem] leading-5 text-[#cbdaf0]">{node.address}</div><button onClick={()=>navigator.clipboard.writeText(node.address)} aria-label="Copy address"><Copy className="h-3.5 w-3.5 text-[#a6c9ff]"/></button></div><Section title="OVERVIEW"><Row k="TRANSACTIONS" v={node.txCount}/><Row k="NATIVE VOLUME" v={formatEth(node.volumeWei)}/><Row k="TOKEN TRANSFERS" v={tokens.length}/><Row k="RELATED NODES" v={edges.length}/><Row k="RELATIONSHIP DEPTH" v={node.depth}/><Row k="ALGORITHM SIGNAL" v={`${Math.round(node.riskScore*100)}% RISK`}/></Section>{flow?<Section title="VALUE FLOW"><div className="grid grid-cols-2 gap-2"><Flow label="INFLOW" value={formatEth(flow.inboundVolumeWei)} green/><Flow label="OUTFLOW" value={formatEth(flow.outboundVolumeWei)}/></div><div className="mt-2"><Row k="FIRST ACTIVITY" v={flow.firstActivityAt?new Date(flow.firstActivityAt).toLocaleString():'—'}/><Row k="LAST ACTIVITY" v={flow.lastActivityAt?new Date(flow.lastActivityAt).toLocaleString():'—'}/></div></Section>:null}{tokens.length?<Section title={`TOKEN EVIDENCE (${tokens.length})`}><div className="space-y-2">{tokens.slice(0,6).map(t=><a key={`${t.transactionHash}:${t.logIndex}`} href={explorerTxUrl(chain,t.transactionHash)??'#'} target="_blank" rel="noreferrer" className="block border border-[#a6c9ff]/10 bg-[#050c18]/70 p-2 font-mono text-[.55rem]"><div className="flex justify-between text-[#a6c9ff]"><span>{t.direction.toUpperCase()} · {t.standard.toUpperCase()}</span><span>{shortenHash(t.transactionHash,7,5)} ↗</span></div><div className="mt-1 break-all text-[#9bafcc]">TOKEN {shortenAddress(t.tokenAddress,6,4)} · RAW {t.amountRaw??'UNAVAILABLE'}</div></a>)}</div></Section>:null}<Section title={`RELATED EDGES (${edges.length})`}><div className="space-y-2">{edges.slice(0,6).map(e=><Edge key={e.id} edge={e} node={node.address} chain={chain}/>)}</div></Section>{recent.length?<Section title="RECENT OBSERVED HASHES">{recent.map(e=>e.sampleTxHashes[0]&&<a key={e.id} href={explorerTxUrl(chain,e.sampleTxHashes[0])??'#'} target="_blank" rel="noreferrer" className="flex justify-between border-b border-[#a6c9ff]/8 py-2 font-mono text-[.58rem] text-[#a6c9ff]"><span>{shortenHash(e.sampleTxHashes[0],8,6)}</span><span>{new Date(e.lastSeenAt).toLocaleDateString()}</span></a>)}</Section>:null}{explorerAddressUrl(chain,node.address)?<a href={explorerAddressUrl(chain,node.address)!} target="_blank" rel="noreferrer" className="network-primary mt-5 flex h-11 w-full">VIEW ON BLOCK EXPLORER <ExternalLink className="h-3.5 w-3.5"/></a>:null}</div>}
function Tag({children}:{children:React.ReactNode}){return <span className="border border-[#a6c9ff]/25 bg-[#6baaff]/10 px-2 py-1 font-mono text-[.5rem] tracking-[.1em] text-[#a6c9ff]">{children}</span>}
function Section({title,children}:{title:string;children:React.ReactNode}){return <section className="mt-5 border-t border-[#a6c9ff]/12 pt-4"><h3 className="mb-3 font-mono text-[.58rem] tracking-[.16em] text-[#8db4ea]">{title}</h3>{children}</section>}
function Row({k,v}:{k:string;v:React.ReactNode}){return <div className="flex justify-between gap-3 py-1 text-[.67rem]"><span className="text-[#9bafcc]">{k}</span><span className="text-right font-mono text-[#eef5ff]">{v}</span></div>}
function Flow({label,value,green}:{label:string;value:string;green?:boolean}){return <div className="border border-[#a6c9ff]/12 bg-[#07101d] p-3"><div className={cn('font-mono text-[.5rem]',green?'text-emerald-400':'text-rose-400')}>{label}</div><div className="mt-1 font-display text-sm font-bold">{value}</div></div>}
function Edge({edge,node,chain}:{edge:RelationshipEdge;node:string;chain:string}){const other=edge.source===node?edge.target:edge.source;return <div className="border border-[#a6c9ff]/10 bg-[#050c18]/70 p-2.5"><div className="flex justify-between font-mono text-[.6rem]"><span className="text-[#a6c9ff]">{shortenAddress(other,7,5)}</span><span>{Math.round(edge.confidence*100)}%</span></div><div className="mt-1 flex gap-3 text-[.55rem] text-[#9bafcc]"><span>{edge.txCount} TX</span><span>{formatEth(edge.nativeValueWei??edge.volumeWei)}</span>{edge.tokenTransfers?.length?<span>{edge.tokenTransfers.length} TOKEN</span>:null}{edge.sampleTxHashes[0]?<a href={explorerTxUrl(chain,edge.sampleTxHashes[0])??'#'} target="_blank" rel="noreferrer" className="ml-auto text-[#a6c9ff]">HASH ↗</a>:null}</div></div>}
