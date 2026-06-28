// npm
import type { Metadata } from 'next';
// styling
import '@/styles/globals.css';
import { Inter } from 'next/font/google';
// state
import { ThemeProvider } from '@/context/ThemeProvider';
import { AuthProvider } from '@/context/AuthProvider';
// components
import { NavBar } from '@/components/layout/NavBar';
import { Footer } from '@/components/layout/Footer';
import { CurrencyProvider } from '@/context/CurrencyContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MetrixFolio',
  description: 'Private portfolio analytics dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/assets/favicon.png" sizes="any" />
        <title>MetrixFolio</title>
      </head>
      <body className={`${inter.className} min-h-screen relative overflow-x-hidden selection:bg-indigo-500/30`}>
        {/* Dynamic Background Gradient Blobs */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blob-left blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blob-right blur-[120px]" />
        </div>

        {/* Content Wrapper */}
        <div className="relative z-10 flex min-h-screen flex-col">
          <ThemeProvider>
            <AuthProvider>
              <CurrencyProvider>{children}</CurrencyProvider>
            </AuthProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
