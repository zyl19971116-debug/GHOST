/**
 * Navigation model.
 *
 * IMPORTANT: this module must stay free of the `'use client'` directive.
 * It is imported by both the client Header and server-rendered sections; if the
 * values came out of a client module, calling methods on them during
 * prerendering throws "Attempted to call X() from the server".
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  /** Shown in the HUD tooltip / footer sitemap. */
  description: string;
  /** Short code rendered as a HUD prefix in the header. */
  code: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'HOME',
    href: '/',
    code: '00',
    description: 'Command surface and live network telemetry.',
  },
  {
    id: 'network',
    label: 'NETWORK',
    href: '/network',
    code: '01',
    description: 'Interactive on-chain wallet relationship graph.',
  },
  {
    id: 'analyze',
    label: 'ANALYZE',
    href: '/analyze',
    code: '02',
    description: 'Trace a wallet through real on-chain transactions.',
  },
  {
    id: 'intel',
    label: 'INTEL',
    href: '/intel',
    code: '03',
    description: 'Live on-chain activity feed with filtering.',
  },
  {
    id: 'archive',
    label: 'ARCHIVE',
    href: '/archive',
    code: '04',
    description: 'Saved analyses and on-chain attestation records.',
  },
  {
    id: 'docs',
    label: 'DOCS',
    href: '/docs',
    code: '05',
    description: 'Mechanism, data sources, AI boundaries, privacy and risk.',
  },
];

export const FOOTER_GROUPS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: 'PROTOCOL',
    items: [
      { label: 'HOME', href: '/' },
      { label: 'NETWORK', href: '/network' },
      { label: 'ANALYZE', href: '/analyze' },
    ],
  },
  {
    title: 'INTELLIGENCE',
    items: [
      { label: 'INTEL FEED', href: '/intel' },
      { label: 'ARCHIVE', href: '/archive' },
      { label: 'SETTINGS', href: '/settings' },
    ],
  },
  {
    title: 'REFERENCE',
    items: [
      { label: 'DOCS', href: '/docs' },
      { label: 'DATA SOURCES', href: '/docs#data-sources' },
      { label: 'AI BOUNDARIES', href: '/docs#ai-boundaries' },
      { label: 'RISK & PRIVACY', href: '/docs#risk' },
    ],
  },
];

export const HOME_CARDS: {
  id: string;
  title: string;
  href: string;
  tag: string;
  body: string;
}[] = [
  {
    id: 'wallet-intelligence',
    title: 'WALLET INTELLIGENCE',
    href: '/analyze',
    tag: 'MODULE 01',
    body:
      'Resolve any EVM address into a source-linked profile: balances, nonce, contract status, counterparties and observed activity windows.',
  },
  {
    id: 'network-explorer',
    title: 'NETWORK EXPLORER',
    href: '/network',
    tag: 'MODULE 02',
    body:
      'Render the counterparty graph in 2D or 3D. Zoom, pan, filter by wallet, and set relationship depth from one to three hops.',
  },
  {
    id: 'ai-analysis',
    title: 'AI ANALYSIS',
    href: '/analyze',
    tag: 'MODULE 03',
    body:
      'A deterministic engine computes the statistics first. A language model — only when configured — narrates them with explicit confidence and limits.',
  },
  {
    id: 'onchain-archive',
    title: 'ONCHAIN ARCHIVE',
    href: '/archive',
    tag: 'MODULE 04',
    body:
      'Store an analysis hash with an optional on-chain attestation: report version, timestamp, wallet and metadata CID. Never the report body.',
  },
];
