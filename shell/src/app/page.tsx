'use client';

import { AppShell } from '@/components/AppShell';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { authClient } from '@/lib/auth-client';

export default function HomePage() {
  const { data: session, isPending, refetch } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-gov-50">
        <div className="w-10 h-10 border-4 border-gov-200 border-t-gov-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <OnboardingFlow onAuthenticatedAction={refetch} />;
  }

  return <AppShell />;
}
