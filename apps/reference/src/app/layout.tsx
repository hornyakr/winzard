import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { createPublicAppConfig } from '@/platform/config/public-config';

import './globals.css';

const publicConfig = createPublicAppConfig();

export const metadata: Metadata = {
  title: publicConfig.appName,
  description: 'Convention-driven application platform.',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="hu">
      <body>{children}</body>
    </html>
  );
}
