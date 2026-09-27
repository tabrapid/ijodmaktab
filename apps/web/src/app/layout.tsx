import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Ijod maktabi', template: '%s · Ijod maktabi' },
  description: 'Hamid Olimjon va Zulfiya ijod maktabi: portfolio, onlayn nazorat ishlari va ta’lim natijalari tizimi',
  applicationName: 'Ijod maktabi',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1020' },
  ],
};

/**
 * Birinchi chizishdan oldin mavzuni qo‘llaydi (yorug‘ sahifa “miltillamasin”). Kalit va qoida
 * lib/theme.ts bilan bir xil: 'ijod:theme' = light | dark, yo‘q bo‘lsa — tizim sozlamasi.
 */
const THEME_SCRIPT = `(function(){var r=document.documentElement,c=null,d=false;try{c=localStorage.getItem('ijod:theme')}catch(e){}if(c==='dark')d=true;else if(c!=='light'){try{d=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}}if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light'})()`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
