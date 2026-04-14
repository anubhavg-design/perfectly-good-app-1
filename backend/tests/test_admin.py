import pytest
import requests
import time

class TestAdmin:
    """Admin endpoint tests"""

    def test_admin_vendors_requires_admin(self, base_url, vendor_token):
        """Test GET /admin/vendors requires admin role"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {vendor_token}"})
        
        response = session.get(f"{base_url}/api/admin/vendors")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Admin vendors endpoint requires admin role")

    def test_admin_get_vendors(self, base_url, admin_token):
        """Test GET /admin/vendors returns vendor list"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        response = session.get(f"{base_url}/api/admin/vendors")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        assert len(data) >= 2, f"Expected at least 2 vendors, got {len(data)}"
        
        # Verify vendor structure
        vendor = data[0]
        assert 'vendor_id' in vendor
        assert 'name' in vendor
        assert 'category' in vendor
        
        print(f"✓ GET /admin/vendors returns {len(data)} vendors")

    def test_admin_create_vendor(self, base_url, admin_token):
        """Test POST /admin/vendors creates new vendor"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        vendor_email = f"TEST_vendor_{int(time.time())}@test.com"
        
        response = session.post(
            f"{base_url}/api/admin/vendors",
            json={
                "name": "Test Vendor",
                "category": "Cafe",
                "email": vendor_email,
                "password": "vendor123",
                "location": {"lat": 12.97, "lon": 77.59, "address": "Test Location"}
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'vendor_id' in data
        assert data['email'] == vendor_email.lower(), "Email should be normalized to lowercase"
        assert data['category'] == "Cafe"
        
        print(f"✓ Create vendor successful: {data['vendor_id']}")
        
        # Verify vendor can login
        login_response = session.post(
            f"{base_url}/api/auth/login",
            json={"email": vendor_email, "password": "vendor123"}
        )
        assert login_response.status_code == 200, "Newly created vendor cannot login"
        print(f"✓ Newly created vendor can login")

    def test_admin_get_vendor_menu(self, base_url, admin_token):
        """Test GET /admin/vendors/{vendor_id}/menu returns menu items"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Get vendors first
        vendors_response = session.get(f"{base_url}/api/admin/vendors")
        vendors = vendors_response.json()
        assert len(vendors) > 0, "Need at least one vendor"
        
        vendor_id = vendors[0]['vendor_id']
        
        # Get vendor menu
        response = session.get(f"{base_url}/api/admin/vendors/{vendor_id}/menu")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        
        print(f"✓ GET /admin/vendors/{vendor_id}/menu returns {len(data)} items")

    def test_admin_add_menu_item(self, base_url, admin_token):
        """Test POST /admin/vendors/{vendor_id}/menu adds menu item"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Get vendors first
        vendors_response = session.get(f"{base_url}/api/admin/vendors")
        vendors = vendors_response.json()
        vendor_id = vendors[0]['vendor_id']
        
        # Add menu item
        response = session.post(
            f"{base_url}/api/admin/vendors/{vendor_id}/menu",
            json={
                "name": "TEST Menu Item",
                "description": "Test description",
                "original_price": 100,
                "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'menu_item_id' in data
        assert data['name'] == "TEST Menu Item"
        assert data['original_price'] == 100
        
        print(f"✓ Add menu item successful: {data['menu_item_id']}")

    def test_admin_delete_menu_item(self, base_url, admin_token):
        """Test DELETE /admin/menu-items/{menu_item_id} deletes menu item"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Create a menu item first
        vendors_response = session.get(f"{base_url}/api/admin/vendors")
        vendors = vendors_response.json()
        vendor_id = vendors[0]['vendor_id']
        
        create_response = session.post(
            f"{base_url}/api/admin/vendors/{vendor_id}/menu",
            json={
                "name": "TEST Delete Item",
                "description": "To be deleted",
                "original_price": 50,
                "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600"
            }
        )
        menu_item = create_response.json()
        menu_item_id = menu_item['menu_item_id']
        
        # Delete menu item
        response = session.delete(f"{base_url}/api/admin/menu-items/{menu_item_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'message' in data
        
        print(f"✓ Delete menu item successful: {menu_item_id}")
