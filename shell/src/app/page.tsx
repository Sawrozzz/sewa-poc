'use client';

import { authClient } from '@/lib/auth-client';
import { AppShell } from '@/components/AppShell';
import { LoginForm } from '@/components/LoginForm';

export default function HomePage() {
  const { data: session, isPending, refetch } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="w-10 h-10 border-4 border-gov-200 border-t-gov-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginForm onLoginSuccessAction={refetch} />;
  }

  return <AppShell />;
}
