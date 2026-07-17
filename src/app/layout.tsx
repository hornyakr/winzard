import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata: Metadata = { title: 'Winzard', description: 'Convention-driven application platform.' };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="hu"><body>{children}</body></html>; }
