import React from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { hasSeenOnboarding } from '../src/utils/onboarding';
import BrandedLoader from '../src/components/BrandedLoader';

// Guest-first entry gate (Apple 5.1.1): the app launches straight into the
// Home feed. Staff/vendors go to their dashboards; logged-in customers see the
// one-time onboarding then Home; guests browse Home without signing in.
export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    (async () => {
      const role = (user as any)?.role;
      const staff = ['admin', 'operations', 'customer_success', 'finance'];
      if (role && staff.includes(role)) { router.replace('/ops'); return; }
      if (role === 'vendor' || role === 'vendor_staff') { router.replace('/(tabs)/dashboard'); return; }
      if (user) {
        const seen = await hasSeenOnboarding(user.user_id);
        router.replace(seen ? '/(tabs)/home' : '/onboarding');
        return;
      }
      // Guest: browse freely.
      router.replace('/(tabs)/home');
    })();
  }, [user, loading]);

  return <BrandedLoader />;
}
