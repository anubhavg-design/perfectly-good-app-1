import React from 'react';
import { Redirect } from 'expo-router';

// The old Admin menu-management screen has been replaced by the full
// operations dashboard at /ops (admins have every permission, so they see
// all metrics, vendors, orders, users and payouts there).
export default function AdminScreen() {
  return <Redirect href="/ops" />;
}
