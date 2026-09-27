import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Ijod maktabi', template: '%s · Ijod maktabi' },
  description: 'Portfolio, onlayn nazorat ishlari va ta’lim natijalari tizimi',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="uz">
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
