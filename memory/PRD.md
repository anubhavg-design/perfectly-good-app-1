# Perfectly Good — PRD

## Overview
"Perfectly Good" is a React Native Expo mobile app for a surplus food marketplace. Users discover and reserve discounted surplus food from nearby restaurants.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with expo-router file-based navigation
- **Backend**: FastAPI with MongoDB (local), JWT auth, bcrypt password hashing
- **Payments**: Razorpay via WebView (test key: rzp_test_SSfFeyx6ytVg0B, order creation mocked)
- **Auth**: JWT Bearer tokens stored in AsyncStorage

## API Endpoints (34 total, all tested)
### Auth (6 endpoints)
- POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- POST /api/auth/forgot-password, POST /api/auth/reset-password

### Drops (3 endpoints)
- GET /api/drops (with search, category, max_price, sort_by filters)
- GET /api/drops/{item_id}, GET /api/drops/categories

### Orders (3 endpoints)
- POST /api/orders/create, POST /api/orders/verify, GET /api/orders/user

### Vendor (6 endpoints)
- GET /api/vendor/menu, GET /api/vendor/drops, POST /api/vendor/drops
- PUT /api/vendor/drops/{id}, GET /api/vendor/orders, PUT /api/vendor/orders/{id}/status

### Admin (6 endpoints)
- GET /api/admin/vendors, POST /api/admin/vendors, DELETE /api/admin/vendors/{id}
- GET /api/admin/vendors/{id}/menu, POST /api/admin/vendors/{id}/menu
- DELETE /api/admin/menu-items/{id}, POST /api/admin/upload

## Seed Data
- Admin: admin@perfectlygood.com / admin123
- Vendor 1: vendor@demo.com / vendor123 (Green Leaf Bakery, 3 menu items, 3 drops)
- Vendor 2: spicegarden@demo.com / vendor123 (Spice Garden, 3 menu items, 3 drops)
- Total: 6 active drops, 6 menu items, 2 vendors

## Screens (12 total)
- Login/Register, Forgot Password
- Home Feed (search + filters), Drop Detail, Checkout (Razorpay WebView)
- My Orders, Profile
- Vendor Dashboard (Drops + Orders tabs), Create Drop
- Admin Panel (vendor & menu CRUD)

## Design System
- Primary: #2E7D32, Background: #FDFBF7, Urgent: #C65D47
- Fonts: Outfit (headings), DM Sans (body)
- Cards: 16px radius, floating badges, large food images
