'use client';
import { Footer } from '@/components/layout/Footer';
import { NavBar } from '@/components/layout/NavBar';
import { useAuth } from '@/context/AuthProvider';
import { useIBKRSync } from '@/hooks/useIBKRSync';
import { redirect } from 'next/navigation';

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading } = useAuth();
  useIBKRSync(); // triggers daily auto-sync if IBKR is configured

  if (loading) {
    return null;
  }

  if (!user) {
    redirect('/login');
    return null;
  }

  return (
    <>
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <main className="container mx-auto grow p-4">{children}</main>
        <Footer />
      </div>
    </>
  );
}
