import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StarBrickVII',
  description: 'WebAssembly-based Encoding/Decoding Toolkit',
  keywords: ['wasm', 'webassembly', 'encoding', 'decoding', 'base64', 'hex', 'binary'],
  authors: [{ name: 'Dustspan' }],
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
