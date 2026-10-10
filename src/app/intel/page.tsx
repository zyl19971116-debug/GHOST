import type { Metadata } from 'next';
import { IntelFeed } from '@/components/intel/IntelFeed';

export const metadata: Metadata = {
  title: 'Intel',
  description: 'Live on-chain activity feed with search and event-type filtering, read directly from the configured network.',
};

export default function IntelPage() {
  return <IntelFeed />;
}
