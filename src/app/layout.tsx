import type { Metadata, Viewport } from 'next';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HudBackground } from '@/components/layout/HudBackground';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'GHOST PROTOCOL AI — The Invisible Intelligence Layer',
    template: '%s · GHOST PROTOCOL AI',
  },
  description:
    'On-chain wallet relationship analysis. Enter an EVM address to read real transactions, map counterparties and trace value flow — every result traceable to a transaction hash.',
  applicationName: 'GHOST PROTOCOL AI',
  keywords: ['on-chain analysis', 'wallet intelligence', 'EVM', 'blockchain forensics', 'transaction graph'],
  openGraph: {
    title: 'GHOST PROTOCOL AI',
    description: 'THE INVISIBLE INTELLIGENCE LAYER — on-chain wallet relationship analysis.',
    type: 'website',
    url: siteUrl,
    siteName: 'GHOST PROTOCOL AI',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#050913',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <HudBackground />
          <a
            href="#main"
            className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ice focus:px-4 focus:py-2 focus:font-display focus:text-xs focus:uppercase focus:tracking-hud focus:text-void"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="relative pt-[68px]">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
