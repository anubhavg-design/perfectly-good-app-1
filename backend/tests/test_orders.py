import pytest
import requests

class TestOrders:
    """Orders endpoint tests"""

    def test_create_order_requires_auth(self, base_url, api_client):
        """Test POST /orders/create requires authentication"""
        response = api_client.post(
            f"{base_url}/api/orders/create",
            json={"food_item_id": "item_123", "quantity": 1}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Create order requires authentication")

    def test_create_order_with_auth(self, base_url, admin_token):
        """Test POST /orders/create with valid auth returns razorpay order"""
        # First get a valid drop
        session = requests.Session()
        drops_response = session.get(f"{base_url}/api/drops")
        drops = drops_response.json()
        assert len(drops) > 0, "Need at least one drop for order test"
        
        drop = drops[0]
        
        # Create order
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = session.post(
            f"{base_url}/api/orders/create",
            json={"food_item_id": drop['item_id'], "quantity": 1}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "razorpay_order_id" in data, "Response missing razorpay_order_id"
        assert "key_id" in data, "Response missing key_id"
        assert "amount" in data, "Response missing amount"
        assert data['key_id'] == "rzp_test_SSfFeyx6ytVg0B"
        
        print(f"✓ Create order returns razorpay order: {data['razorpay_order_id']}")

    def test_create_order_invalid_drop(self, base_url, admin_token):
        """Test POST /orders/create with invalid drop ID returns 404"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        response = session.post(
            f"{base_url}/api/orders/create",
            json={"food_item_id": "invalid_drop_123", "quantity": 1}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Create order with invalid drop returns 404")

    def test_verify_order_with_auth(self, base_url, admin_token):
        """Test POST /orders/verify creates order record"""
        # First create an order
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        drops_response = session.get(f"{base_url}/api/drops")
        drops = drops_response.json()
        drop = drops[0]
        
        create_response = session.post(
            f"{base_url}/api/orders/create",
            json={"food_item_id": drop['item_id'], "quantity": 1}
        )
        order_data = create_response.json()
        
        # Verify order (mocked payment)
        verify_response = session.post(
            f"{base_url}/api/orders/verify",
            json={
                "razorpay_order_id": order_data['razorpay_order_id'],
                "razorpay_payment_id": "pay_mock123",
                "razorpay_signature": "sig_mock123",
                "food_item_id": drop['item_id'],
                "quantity": 1
            }
        )
        assert verify_response.status_code == 200, f"Expected 200, got {verify_response.status_code}: {verify_response.text}"
        
        verify_data = verify_response.json()
        assert "order_id" in verify_data, "Response missing order_id"
        assert verify_data['message'] == "Order confirmed"
        
        print(f"✓ Verify order successful: {verify_data['order_id']}")

    def test_get_user_orders(self, base_url, admin_token):
        """Test GET /orders/user returns user's orders"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        response = session.get(f"{base_url}/api/orders/user")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        
        print(f"✓ GET /orders/user returns {len(data)} orders")

    def test_get_user_orders_requires_auth(self, base_url, api_client):
        """Test GET /orders/user requires authentication"""
        response = api_client.get(f"{base_url}/api/orders/user")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Get user orders requires authentication")
