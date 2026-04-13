# Perfectly Good — PRD

## Overview
"Perfectly Good" is a React Native Expo mobile app for a surplus food marketplace. Users discover and reserve discounted surplus food from nearby restaurants.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with expo-router file-based navigation
- **Backend**: External API at `https://green-grab-1.preview.emergentagent.com/api`
- **Payments**: Razorpay via WebView (test key: rzp_test_SSfFeyx6ytVg0B)
- **Auth**: Cookie-based JWT with Bearer token fallback

## Roles
1. **User** — Browse drops, reserve food, view orders
2. **Vendor** — Manage drops, manage orders, create new drops
3. **Admin** — Onboard vendors, manage menus

## Screens

### Authentication
- `app/index.tsx` — Login/Register with email + password, forgot password link
- `app/forgot-password.tsx` — Forgot password flow (email → token → reset)

### User Screens (Bottom Tabs)
- `app/(tabs)/home.tsx` — Home feed with search, category filter, sort, food drop cards with images/prices/badges/countdown
- `app/(tabs)/orders.tsx` — My Orders list with status badges (reserved/picked_up/cancelled/expired)
- `app/(tabs)/profile.tsx` — User info, admin panel link (admin), become vendor (user), logout

### Detail Screens
- `app/drop/[id].tsx` — Drop detail with large image, pricing breakdown, savings %, pickup window, Reserve button
- `app/checkout.tsx` — Quantity picker, price breakdown (subtotal + 5% fee), Razorpay WebView payment

### Vendor Screens
- `app/(tabs)/dashboard.tsx` — My Drops (toggle active/inactive) + Orders (Mark Picked Up / Cancel)
- `app/vendor-create-drop.tsx` — Select menu item, set discounted price, quantity, pickup times

### Admin Screens
- `app/admin.tsx` — Vendor list, create vendor, per-vendor menu management (add/delete items)

## Design System
- **Primary**: #2E7D32 (green), **Background**: #FDFBF7, **Urgent**: #C65D47
- **Fonts**: Outfit (headings), DM Sans (body)
- **Cards**: 16px radius, shadows, floating badges on images
- **Icons**: lucide-react-native

## API Endpoints Used
- Auth: /auth/register, /auth/login, /auth/me, /auth/logout, /auth/forgot-password, /auth/reset-password
- Drops: /drops, /drops/{id}, /drops/categories
- Orders: /orders/create, /orders/verify, /orders/user
- Vendor: /vendor/drops, /vendor/orders, /vendor/menu
- Admin: /admin/vendors, /admin/vendors/{id}/menu, /admin/menu-items/{id}

## Default Location
- Bangalore (lat: 12.9716, lon: 77.5946) used as fallback when geolocation unavailable
