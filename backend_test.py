#!/usr/bin/env python3
"""
Backend API Testing for Perfectly Good Marketplace
Tests authentication, drops listing, and payout endpoints
"""

import requests
import json
import sys
from typing import Optional

# Backend URL from frontend/.env
BACKEND_URL = "https://food-rescue-app-9.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"
VENDOR_EMAIL = "vendor@demo.com"
VENDOR_PASSWORD = "vendor123"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name: str):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}TEST: {name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")

def print_success(msg: str):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg: str):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_info(msg: str):
    print(f"{Colors.YELLOW}ℹ {msg}{Colors.END}")

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
    
    def add_pass(self, test_name: str):
        self.passed.append(test_name)
    
    def add_fail(self, test_name: str, error: str):
        self.failed.append((test_name, error))
    
    def summary(self):
        print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
        print(f"{Colors.BLUE}TEST SUMMARY{Colors.END}")
        print(f"{Colors.BLUE}{'='*60}{Colors.END}")
        print(f"{Colors.GREEN}Passed: {len(self.passed)}{Colors.END}")
        print(f"{Colors.RED}Failed: {len(self.failed)}{Colors.END}")
        
        if self.failed:
            print(f"\n{Colors.RED}Failed Tests:{Colors.END}")
            for test_name, error in self.failed:
                print(f"  {Colors.RED}✗ {test_name}{Colors.END}")
                print(f"    Error: {error}")
        
        return len(self.failed) == 0

results = TestResults()

def test_admin_login() -> Optional[str]:
    """Test admin login and return access token"""
    print_test("Admin Login")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                print_success(f"Admin login successful")
                print_info(f"User: {data.get('name')} ({data.get('email')})")
                print_info(f"Role: {data.get('role')}")
                results.add_pass("Admin Login")
                return data["access_token"]
            else:
                print_error("No access_token in response")
                results.add_fail("Admin Login", "No access_token in response")
                return None
        else:
            print_error(f"Login failed: {response.text}")
            results.add_fail("Admin Login", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Admin Login", str(e))
        return None

def test_vendor_login() -> Optional[str]:
    """Test vendor login and return access token"""
    print_test("Vendor Login")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": VENDOR_EMAIL, "password": VENDOR_PASSWORD},
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                print_success(f"Vendor login successful")
                print_info(f"User: {data.get('name')} ({data.get('email')})")
                print_info(f"Role: {data.get('role')}")
                results.add_pass("Vendor Login")
                return data["access_token"]
            else:
                print_error("No access_token in response")
                results.add_fail("Vendor Login", "No access_token in response")
                return None
        else:
            print_error(f"Login failed: {response.text}")
            results.add_fail("Vendor Login", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Vendor Login", str(e))
        return None

def test_auth_me(token: str, expected_role: str):
    """Test /auth/me endpoint"""
    print_test(f"Auth Me ({expected_role})")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("role") == expected_role:
                print_success(f"Auth me successful - Role: {data.get('role')}")
                print_info(f"User: {data.get('name')} ({data.get('email')})")
                results.add_pass(f"Auth Me ({expected_role})")
            else:
                print_error(f"Role mismatch: expected {expected_role}, got {data.get('role')}")
                results.add_fail(f"Auth Me ({expected_role})", f"Role mismatch: expected {expected_role}, got {data.get('role')}")
        else:
            print_error(f"Auth me failed: {response.text}")
            results.add_fail(f"Auth Me ({expected_role})", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail(f"Auth Me ({expected_role})", str(e))

def test_drops_categories():
    """Test GET /drops/categories"""
    print_test("Drops Categories")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/drops/categories",
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            categories = response.json()
            print_success(f"Categories retrieved: {len(categories)} categories")
            print_info(f"Categories: {categories}")
            results.add_pass("Drops Categories")
        else:
            print_error(f"Failed to get categories: {response.text}")
            results.add_fail("Drops Categories", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Drops Categories", str(e))

def test_drops_listing():
    """Test GET /drops"""
    print_test("Drops Listing")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/drops",
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            drops = response.json()
            print_success(f"Drops retrieved: {len(drops)} drops")
            
            # Check if drops have vendor info (N+1 fix verification)
            if drops:
                first_drop = drops[0]
                has_vendor_info = "vendor_name" in first_drop
                print_info(f"First drop has vendor info: {has_vendor_info}")
                if has_vendor_info:
                    print_info(f"Sample drop: {first_drop.get('name')} - Vendor: {first_drop.get('vendor_name')}")
                else:
                    print_error("Drops missing vendor info - N+1 fix may not be working")
            
            results.add_pass("Drops Listing")
        else:
            print_error(f"Failed to get drops: {response.text}")
            results.add_fail("Drops Listing", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Drops Listing", str(e))

def test_vendor_payouts_summary(vendor_token: str):
    """Test GET /vendor/payouts/summary (N+1 fix)"""
    print_test("Vendor Payouts Summary")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/vendor/payouts/summary",
            headers={"Authorization": f"Bearer {vendor_token}"},
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_success("Vendor payouts summary retrieved")
            print_info(f"Total orders completed: {data.get('total_orders_completed')}")
            print_info(f"Total revenue: ₹{data.get('total_revenue')}")
            print_info(f"Net earnings: ₹{data.get('net_earnings')}")
            print_info(f"Pending payout: ₹{data.get('pending_payout')}")
            results.add_pass("Vendor Payouts Summary")
        else:
            print_error(f"Failed to get vendor payouts summary: {response.text}")
            results.add_fail("Vendor Payouts Summary", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Vendor Payouts Summary", str(e))

def test_vendor_payouts_orders(vendor_token: str):
    """Test GET /vendor/payouts/orders (N+1 fix)"""
    print_test("Vendor Payouts Orders")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/vendor/payouts/orders",
            headers={"Authorization": f"Bearer {vendor_token}"},
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            orders = response.json()
            print_success(f"Vendor payouts orders retrieved: {len(orders)} orders")
            
            if orders:
                first_order = orders[0]
                print_info(f"Sample order: {first_order.get('food_item_name')} - Qty: {first_order.get('quantity')} - Earning: ₹{first_order.get('vendor_earning')}")
            
            results.add_pass("Vendor Payouts Orders")
        else:
            print_error(f"Failed to get vendor payouts orders: {response.text}")
            results.add_fail("Vendor Payouts Orders", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Vendor Payouts Orders", str(e))

def test_admin_payouts_vendors(admin_token: str):
    """Test GET /admin/payouts/vendors (N+1 fix)"""
    print_test("Admin Payouts Vendors")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/admin/payouts/vendors",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            vendors = response.json()
            print_success(f"Admin payouts vendors retrieved: {len(vendors)} vendors")
            
            if vendors:
                first_vendor = vendors[0]
                print_info(f"Sample vendor: {first_vendor.get('vendor_name')} - Orders: {first_vendor.get('total_orders_completed')} - Net: ₹{first_vendor.get('net_earnings')}")
            
            results.add_pass("Admin Payouts Vendors")
        else:
            print_error(f"Failed to get admin payouts vendors: {response.text}")
            results.add_fail("Admin Payouts Vendors", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        results.add_fail("Admin Payouts Vendors", str(e))

def main():
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}Perfectly Good Backend API Tests{Colors.END}")
    print(f"{Colors.BLUE}Backend URL: {BACKEND_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    # Test authentication
    admin_token = test_admin_login()
    vendor_token = test_vendor_login()
    
    # Test auth/me endpoints
    if admin_token:
        test_auth_me(admin_token, "admin")
    
    if vendor_token:
        test_auth_me(vendor_token, "vendor")
    
    # Test drops endpoints (public)
    test_drops_categories()
    test_drops_listing()
    
    # Test vendor payout endpoints (N+1 fixes)
    if vendor_token:
        test_vendor_payouts_summary(vendor_token)
        test_vendor_payouts_orders(vendor_token)
    else:
        print_error("Skipping vendor payout tests - no vendor token")
        results.add_fail("Vendor Payouts Summary", "No vendor token available")
        results.add_fail("Vendor Payouts Orders", "No vendor token available")
    
    # Test admin payout endpoints (N+1 fixes)
    if admin_token:
        test_admin_payouts_vendors(admin_token)
    else:
        print_error("Skipping admin payout tests - no admin token")
        results.add_fail("Admin Payouts Vendors", "No admin token available")
    
    # Print summary
    success = results.summary()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
