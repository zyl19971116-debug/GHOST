import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NetworkExplorer } from '@/components/network/NetworkExplorer';
import { Skeleton } from '@/components/ui/input';

export const metadata: Metadata = {
  title: 'Network',
  description:
    'Interactive on-chain wallet relationship graph. Zoom, pan, inspect nodes, filter wallets and set relationship depth — in 2D or 3D.',
};

export default function NetworkPage() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-[1780px] space-y-4 pt-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      }
    >
      <NetworkExplorer />
    </Suspense>
  );
}
