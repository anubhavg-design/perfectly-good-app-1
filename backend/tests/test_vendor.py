import pytest
import requests

class TestVendor:
    """Vendor endpoint tests"""

    def test_vendor_menu_requires_auth(self, base_url, api_client):
        """Test GET /vendor/menu requires authentication"""
        response = api_client.get(f"{base_url}/api/vendor/menu")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Vendor menu requires authentication")

    def test_vendor_menu_with_vendor_auth(self, base_url, vendor_token):
        """Test GET /vendor/menu returns vendor's menu items"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {vendor_token}"})
        
        response = session.get(f"{base_url}/api/vendor/menu")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        assert len(data) >= 3, f"Expected at least 3 menu items, got {len(data)}"
        
        # Verify menu item structure
        item = data[0]
        assert 'menu_item_id' in item
        assert 'name' in item
        assert 'original_price' in item
        
        print(f"✓ GET /vendor/menu returns {len(data)} menu items")

    def test_vendor_drops_with_vendor_auth(self, base_url, vendor_token):
        """Test GET /vendor/drops returns vendor's drops"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {vendor_token}"})
        
        response = session.get(f"{base_url}/api/vendor/drops")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        assert len(data) >= 3, f"Expected at least 3 drops, got {len(data)}"
        
        print(f"✓ GET /vendor/drops returns {len(data)} drops")

    def test_vendor_orders_with_vendor_auth(self, base_url, vendor_token):
        """Test GET /vendor/orders returns vendor's orders"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {vendor_token}"})
        
        response = session.get(f"{base_url}/api/vendor/orders")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        
        print(f"✓ GET /vendor/orders returns {len(data)} orders")

    def test_vendor_menu_with_user_auth_fails(self, base_url, admin_token):
        """Test GET /vendor/menu with admin token (not vendor) returns 403 or 404"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        response = session.get(f"{base_url}/api/vendor/menu")
        # Admin doesn't have vendor profile, should return 404 or 403
        assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}"
        print(f"✓ Vendor menu with non-vendor auth returns {response.status_code}")

    def test_create_vendor_drop(self, base_url, vendor_token):
        """Test POST /vendor/drops creates a new drop"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {vendor_token}"})
        
        # Get vendor's menu items first
        menu_response = session.get(f"{base_url}/api/vendor/menu")
        menu_items = menu_response.json()
        assert len(menu_items) > 0, "Need at least one menu item"
        
        menu_item = menu_items[0]
        
        # Create drop
        response = session.post(
            f"{base_url}/api/vendor/drops",
            json={
                "menu_item_id": menu_item['menu_item_id'],
                "discounted_price": 50,
                "quantity_available": 5,
                "pickup_start_time": "18:00",
                "pickup_end_time": "21:00"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'item_id' in data
        assert data['discounted_price'] == 50
        
        print(f"✓ Create vendor drop successful: {data['item_id']}")

    def test_toggle_vendor_drop(self, base_url, vendor_token):
        """Test PUT /vendor/drops/{item_id} toggles drop active status"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {vendor_token}"})
        
        # Get vendor's drops
        drops_response = session.get(f"{base_url}/api/vendor/drops")
        drops = drops_response.json()
        assert len(drops) > 0, "Need at least one drop"
        
        drop = drops[0]
        current_status = drop['is_active']
        
        # Toggle status
        response = session.put(
            f"{base_url}/api/vendor/drops/{drop['item_id']}",
            json={"is_active": not current_status}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['is_active'] == (not current_status)
        
        print(f"✓ Toggle drop status successful: {drop['item_id']} -> {data['is_active']}")
