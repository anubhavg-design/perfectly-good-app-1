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

    def test_cancel_reserved_order(self, base_url, admin_token):
        """Test PUT /orders/{order_id}/cancel cancels reserved order and restores quantity"""
        # First create and verify an order
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Get a drop
        drops_response = session.get(f"{base_url}/api/drops")
        drops = drops_response.json()
        drop = drops[0]
        initial_qty = drop['quantity_available']
        
        # Create order
        create_response = session.post(
            f"{base_url}/api/orders/create",
            json={"food_item_id": drop['item_id'], "quantity": 1}
        )
        order_data = create_response.json()
        
        # Verify order
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
        order_id = verify_response.json()['order_id']
        
        # Cancel order
        cancel_response = session.put(f"{base_url}/api/orders/{order_id}/cancel")
        assert cancel_response.status_code == 200, f"Expected 200, got {cancel_response.status_code}: {cancel_response.text}"
        
        cancel_data = cancel_response.json()
        assert cancel_data['message'] == "Order cancelled", f"Expected 'Order cancelled', got '{cancel_data['message']}'"
        
        # Verify order status changed to cancelled
        orders_response = session.get(f"{base_url}/api/orders/user")
        orders = orders_response.json()
        cancelled_order = next((o for o in orders if o['order_id'] == order_id), None)
        assert cancelled_order is not None, "Cancelled order not found in user orders"
        assert cancelled_order['status'] == 'cancelled', f"Expected status 'cancelled', got '{cancelled_order['status']}'"
        
        # Verify quantity restored
        drop_response = session.get(f"{base_url}/api/drops/{drop['item_id']}")
        updated_drop = drop_response.json()
        assert updated_drop['quantity_available'] == initial_qty, f"Expected quantity {initial_qty}, got {updated_drop['quantity_available']}"
        
        print(f"✓ Cancel reserved order successful: {order_id}, quantity restored from {initial_qty - 1} to {initial_qty}")

    def test_cancel_non_reserved_order(self, base_url, admin_token):
        """Test PUT /orders/{order_id}/cancel rejects non-reserved orders with 400"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Try to cancel a non-existent order
        cancel_response = session.put(f"{base_url}/api/orders/nonexistent/cancel")
        assert cancel_response.status_code == 404, f"Expected 404 for non-existent order, got {cancel_response.status_code}"
        print("✓ Cancel non-existent order returns 404")
        
        # Create, verify, and cancel an order first
        drops_response = session.get(f"{base_url}/api/drops")
        drops = drops_response.json()
        drop = drops[0]
        
        create_response = session.post(
            f"{base_url}/api/orders/create",
            json={"food_item_id": drop['item_id'], "quantity": 1}
        )
        order_data = create_response.json()
        
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
        order_id = verify_response.json()['order_id']
        
        # Cancel once (should succeed)
        first_cancel = session.put(f"{base_url}/api/orders/{order_id}/cancel")
        assert first_cancel.status_code == 200, "First cancel should succeed"
        
        # Try to cancel again (should fail with 400)
        second_cancel = session.put(f"{base_url}/api/orders/{order_id}/cancel")
        assert second_cancel.status_code == 400, f"Expected 400 for already cancelled order, got {second_cancel.status_code}: {second_cancel.text}"
        
        cancel_data = second_cancel.json()
        assert cancel_data['detail'] == "Only reserved orders can be cancelled", f"Expected 'Only reserved orders can be cancelled', got '{cancel_data['detail']}'"
        print("✓ Cancel already-cancelled order rejected with 400 and correct message")
