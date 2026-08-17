import React, { useEffect, useState } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Home, ShoppingBag, User, LayoutDashboard } from 'lucide-react-native';
import { COLORS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { vendorApi } from '../../src/api/client';
import BrandedLoader from '../../src/components/BrandedLoader';

export default function TabLayout() {
  const { user, loading } = useAuth();
  const isVendor = user?.role === 'vendor';

  // Vendor compliance gate: a vendor with incomplete/unaccepted compliance
  // (draft or rejected) must finish the compliance screen before reaching any tab.
  const [verifChecked, setVerifChecked] = useState(false);
  const [needsCompliance, setNeedsCompliance] = useState(false);

  useEffect(() => {
    let active = true;
    if (isVendor) {
      setVerifChecked(false);
      vendorApi.getVerification()
        .then((r: any) => { if (active) setNeedsCompliance(['draft', 'rejected'].includes(r?.status)); })
        .catch(() => { if (active) setNeedsCompliance(false); })
        .finally(() => { if (active) setVerifChecked(true); });
    } else {
      setVerifChecked(true);
    }
    return () => { active = false; };
  }, [isVendor, (user as any)?.user_id]);

  if (loading || (isVendor && !verifChecked)) {
    return <BrandedLoader />;
  }

  if (isVendor && needsCompliance) {
    return <Redirect href="/vendor-verification" />;
  }

  const showDashboard = user?.role === 'vendor' || user?.role === 'admin' || user?.role === 'vendor_staff';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontFamily: 'DMSans_500Medium',
          fontSize: 11,
        },
      }}
    >
      {/* Vendors cannot browse or place orders — hide the customer Home & Orders tabs */}
      <Tabs.Screen
        name="home"
        options={isVendor ? { href: null } : {
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={isVendor ? { href: null } : {
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} />,
        }}
      />
      {showDashboard ? (
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
          }}
        />
      ) : (
        <Tabs.Screen
          name="dashboard"
          options={{
            href: null,
          }}
        />
      )}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
