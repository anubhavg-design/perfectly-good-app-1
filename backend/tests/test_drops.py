import pytest

class TestDrops:
    """Drops endpoint tests"""

    def test_get_drops_list(self, base_url, api_client):
        """Test GET /drops returns array of food drops"""
        response = api_client.get(f"{base_url}/api/drops")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        assert len(data) >= 6, f"Expected at least 6 drops, got {len(data)}"
        
        # Verify drop structure
        drop = data[0]
        required_fields = ['item_id', 'name', 'description', 'original_price', 'discounted_price', 
                          'quantity_available', 'image_url', 'vendor_name', 'vendor_category']
        for field in required_fields:
            assert field in drop, f"Drop missing required field: {field}"
        
        # Verify prices and images
        assert drop['discounted_price'] < drop['original_price'], "Discounted price should be less than original"
        assert drop['image_url'].startswith('http'), "Image URL should be valid HTTP URL"
        
        print(f"✓ GET /drops returns {len(data)} drops with correct structure")

    def test_get_drops_with_location(self, base_url, api_client):
        """Test GET /drops with lat/lon parameters"""
        response = api_client.get(f"{base_url}/api/drops?lat=12.97&lon=77.59")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"✓ GET /drops with location returns {len(data)} drops")

    def test_get_categories(self, base_url, api_client):
        """Test GET /drops/categories returns ['Bakery', 'Restaurant']"""
        response = api_client.get(f"{base_url}/api/drops/categories")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        assert 'Bakery' in data, "Categories should include 'Bakery'"
        assert 'Restaurant' in data, "Categories should include 'Restaurant'"
        
        print(f"✓ GET /drops/categories returns {data}")

    def test_get_drops_filter_by_category(self, base_url, api_client):
        """Test GET /drops with category filter"""
        response = api_client.get(f"{base_url}/api/drops?category=Bakery")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        assert len(data) > 0, "Should return at least one bakery drop"
        
        # Verify all drops are from Bakery category
        for drop in data:
            assert drop['vendor_category'] == 'Bakery', f"Expected Bakery, got {drop['vendor_category']}"
        
        print(f"✓ Category filter returns {len(data)} Bakery drops")

    def test_get_drops_sort_by_price(self, base_url, api_client):
        """Test GET /drops with sort_by=price"""
        response = api_client.get(f"{base_url}/api/drops?sort_by=price")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert len(data) > 0, "Should return drops"
        
        # Verify sorted by price ascending
        prices = [d['discounted_price'] for d in data]
        assert prices == sorted(prices), "Drops should be sorted by price ascending"
        
        print(f"✓ Sort by price works correctly")

    def test_get_drop_detail(self, base_url, api_client):
        """Test GET /drops/{item_id} returns drop detail"""
        # First get a drop ID
        list_response = api_client.get(f"{base_url}/api/drops")
        drops = list_response.json()
        assert len(drops) > 0, "Need at least one drop for detail test"
        
        item_id = drops[0]['item_id']
        
        # Get drop detail
        response = api_client.get(f"{base_url}/api/drops/{item_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['item_id'] == item_id
        assert 'vendor_name' in data
        assert 'vendor_location' in data
        
        print(f"✓ GET /drops/{item_id} returns drop detail")

    def test_get_drop_not_found(self, base_url, api_client):
        """Test GET /drops/{item_id} with invalid ID returns 404"""
        response = api_client.get(f"{base_url}/api/drops/invalid_id_12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid drop ID returns 404")
