import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://mutual-mesh.kccdv717.chatgpt.site'),
  title: 'Mutual Mesh — Community coordination, shared',
  description:
    'A human-agent coordination canvas that turns community goals, contributions, and constraints into visible, consent-based plans.',
  openGraph: {
    title: 'Mutual Mesh',
    description: 'Turn scattered help into a coordinated plan.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Mutual Mesh — Turn scattered help into a coordinated plan.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mutual Mesh',
    description: 'Turn scattered help into a coordinated plan.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
