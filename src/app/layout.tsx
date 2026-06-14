import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Bible du MJ',
  description: 'Base de connaissances offline-first pour maître du jeu.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0e0e11',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
