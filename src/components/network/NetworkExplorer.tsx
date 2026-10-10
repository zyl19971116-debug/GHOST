'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { NetworkConsole } from './NetworkConsole';
import { getPublicConfig } from '@/lib/config';
import { isValidAddress } from '@/lib/utils';
import type { AnalysisReport, RelationshipEdge, RelationshipNode } from '@/lib/types';
import type { ChainKey } from '@/lib/chains';

type KindFilter = 'all' | 'counterparty' | 'contract' | 'hop2';

export function NetworkExplorer() {
  const params = useSearchParams();
  const pub = getPublicConfig();
  const [chain, setChain] = React.useState<string>(pub.defaultChain);
  const [address, setAddress] = React.useState('');
  const [hops, setHops] = React.useState(1);
  const [view, setView] = React.useState<'2d' | '3d'>('2d');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [walletFilter, setWalletFilter] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<KindFilter>('all');
  const [minConfidence, setMinConfidence] = React.useState(0);

  React.useEffect(() => {
    const a = params.get('address'); const c = params.get('chain'); const h = params.get('hops');
    if (a && isValidAddress(a)) setAddress(a);
    if (c && (pub.chains as string[]).includes(c)) setChain(c);
    if (h && ['1', '2', '3'].includes(h)) setHops(Number(h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const graph = useMutation({ mutationFn: async (args: { chain: string; address: string; hops: number }) => {
    if (args.chain !== 'robinhood') throw new Error('NETWORK EXPLORER graph queries currently support Robinhood Chain mainnet (chain ID 4663) only.');
    const res = await fetch('/api/network/graph', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: args.address, chainId: 4663, depth: args.hops > 1 ? 2 : 1, limit: 100 }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? 'Graph build failed');
    const data = json.data as { report: AnalysisReport; nodes: RelationshipNode[]; edges: RelationshipEdge[] };
    return { ...data.report, graph: { nodes: data.nodes, edges: data.edges } } as AnalysisReport;
  }});

  const report = graph.data; const nodes = report?.graph.nodes ?? []; const edges = report?.graph.edges ?? [];
  const filterSet = React.useMemo(() => {
    const set = new Set<string>(); const q = walletFilter.trim().toLowerCase();
    if (!q && kindFilter === 'all') return set;
    for (const n of nodes) {
      if (q && !n.address.includes(q)) continue;
      if (kindFilter === 'contract' && n.kind !== 'contract') continue;
      if (kindFilter === 'counterparty' && n.kind !== 'counterparty') continue;
      if (kindFilter === 'hop2' && n.depth < 2) continue;
      set.add(n.address);
    }
    return set;
  }, [nodes, walletFilter, kindFilter]);
  const visibleEdges = React.useMemo(() => edges.filter((e) => e.confidence >= minConfidence), [edges, minConfidence]);
  const selectedNode = nodes.find((n) => n.address === selected) ?? null;
  const selectedEdges = edges.filter((e) => e.source === selected || e.target === selected);
  const clientValid = isValidAddress(address.trim());
  const run = React.useCallback(() => { const a = address.trim(); if (!isValidAddress(a)) return; setSelected(null); graph.mutate({ chain, address: a, hops }); }, [address, chain, hops, graph]);

  return <NetworkConsole chains={pub.chains as ChainKey[]} chain={chain} setChain={setChain} address={address} setAddress={setAddress} valid={clientValid} run={run} hops={hops} setHops={setHops} view={view} setView={setView} walletFilter={walletFilter} setWalletFilter={setWalletFilter} kindFilter={kindFilter} setKindFilter={setKindFilter} minConfidence={minConfidence} setMinConfidence={setMinConfidence} pending={graph.isPending} error={graph.error instanceof Error ? graph.error.message : null} retry={run} report={report} nodes={nodes} edges={edges} visibleEdges={visibleEdges} filterSet={filterSet} selected={selected} setSelected={setSelected} selectedNode={selectedNode} selectedEdges={selectedEdges} />;
}
