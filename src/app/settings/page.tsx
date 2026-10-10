import type { Metadata } from 'next';
import { SettingsView } from '@/components/settings/SettingsView';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Wallet connection state, network reachability and interface preferences.',
};

export default function SettingsPage() {
  return <SettingsView />;
}
