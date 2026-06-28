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
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <CurrencyProvider>{children}</CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
