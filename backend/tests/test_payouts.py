"""
Payout endpoints testing
Tests vendor payout summary, orders, and admin payment tracking
"""
import pytest
import requests

class TestVendorPayouts:
    """Vendor payout endpoints - summary and completed orders"""

    def test_vendor_payouts_summary_requires_auth(self, base_url, api_client):
        """Verify vendor payouts summary requires authentication"""
        response = api_client.get(f"{base_url}/api/vendor/payouts/summary")
        assert response.status_code == 401

    def test_vendor_payouts_summary_success(self, base_url, vendor_token, api_client):
        """Verify vendor can get payout summary"""
        api_client.headers.update({"Authorization": f"Bearer {vendor_token}"})
        response = api_client.get(f"{base_url}/api/vendor/payouts/summary")
        assert response.status_code == 200
        
        data = response.json()
        # Verify all required fields present
        assert "total_orders_completed" in data
        assert "total_revenue" in data
        assert "total_commission" in data
        assert "net_earnings" in data
        assert "total_paid" in data
        assert "pending_payout" in data
        
        # Verify data types
        assert isinstance(data["total_orders_completed"], int)
        assert isinstance(data["total_revenue"], (int, float))
        assert isinstance(data["total_commission"], (int, float))
        assert isinstance(data["net_earnings"], (int, float))
        assert isinstance(data["total_paid"], (int, float))
        assert isinstance(data["pending_payout"], (int, float))
        
        # Verify commission calculation: net_earnings = total_revenue - total_commission
        expected_net = round(data["total_revenue"] - data["total_commission"], 2)
        assert data["net_earnings"] == expected_net
        
        # Verify pending calculation: pending = net_earnings - total_paid
        expected_pending = round(data["net_earnings"] - data["total_paid"], 2)
        assert data["pending_payout"] == expected_pending

    def test_vendor_payouts_orders_requires_auth(self, base_url, api_client):
        """Verify vendor payouts orders requires authentication"""
        response = api_client.get(f"{base_url}/api/vendor/payouts/orders")
        assert response.status_code == 401

    def test_vendor_payouts_orders_success(self, base_url, vendor_token, api_client):
        """Verify vendor can get completed orders list"""
        api_client.headers.update({"Authorization": f"Bearer {vendor_token}"})
        response = api_client.get(f"{base_url}/api/vendor/payouts/orders")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # If there are completed orders, verify structure
        if len(data) > 0:
            order = data[0]
            assert "order_id" in order
            assert "food_item_name" in order
            assert "quantity" in order
            assert "discounted_price" in order
            assert "vendor_earning" in order
            assert "commission" in order
            assert "created_at" in order
            
            # Verify commission calculation: 15% of (discounted_price * quantity)
            line_total = round(order["discounted_price"] * order["quantity"], 2)
            expected_commission = round(line_total * 0.15, 2)
            assert order["commission"] == expected_commission
            
            # Verify vendor earning = line_total - commission
            expected_earning = round(line_total - expected_commission, 2)
            assert order["vendor_earning"] == expected_earning

    def test_vendor_payouts_non_vendor_forbidden(self, base_url, admin_token, api_client):
        """Verify non-vendor users cannot access vendor payout endpoints"""
        # Admin should not be able to access vendor endpoints
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{base_url}/api/vendor/payouts/summary")
        # Admin role is allowed but needs vendor profile, should return 404
        assert response.status_code in (403, 404)


class TestAdminPayouts:
    """Admin payout management - vendors list, add payout, history"""

    def test_admin_payouts_vendors_requires_auth(self, base_url, api_client):
        """Verify admin payouts vendors requires authentication"""
        response = api_client.get(f"{base_url}/api/admin/payouts/vendors")
        assert response.status_code == 401

    def test_admin_payouts_vendors_requires_admin(self, base_url, vendor_token, api_client):
        """Verify admin payouts vendors requires admin role"""
        api_client.headers.update({"Authorization": f"Bearer {vendor_token}"})
        response = api_client.get(f"{base_url}/api/admin/payouts/vendors")
        assert response.status_code == 403

    def test_admin_payouts_vendors_success(self, base_url, admin_token, api_client):
        """Verify admin can get all vendors with payout status"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{base_url}/api/admin/payouts/vendors")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # At least 2 vendors seeded
        
        # Verify structure of vendor payout data
        vendor = data[0]
        assert "vendor_id" in vendor
        assert "vendor_name" in vendor
        assert "total_orders_completed" in vendor
        assert "net_earnings" in vendor
        assert "total_paid" in vendor
        assert "pending_payout" in vendor
        
        # Verify pending calculation
        expected_pending = round(vendor["net_earnings"] - vendor["total_paid"], 2)
        assert vendor["pending_payout"] == expected_pending

    def test_admin_add_payout_requires_auth(self, base_url, api_client):
        """Verify add payout requires authentication"""
        response = api_client.post(f"{base_url}/api/admin/payouts/add", json={
            "vendor_id": "vendor_test",
            "amount": 100,
            "note": "Test payout"
        })
        assert response.status_code == 401

    def test_admin_add_payout_requires_admin(self, base_url, vendor_token, api_client):
        """Verify add payout requires admin role"""
        api_client.headers.update({"Authorization": f"Bearer {vendor_token}"})
        response = api_client.post(f"{base_url}/api/admin/payouts/add", json={
            "vendor_id": "vendor_test",
            "amount": 100,
            "note": "Test payout"
        })
        assert response.status_code == 403

    def test_admin_add_payout_invalid_vendor(self, base_url, admin_token, api_client):
        """Verify add payout fails for invalid vendor"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.post(f"{base_url}/api/admin/payouts/add", json={
            "vendor_id": "invalid_vendor_id_12345",
            "amount": 100,
            "note": "Test payout"
        })
        assert response.status_code == 404

    def test_admin_add_payout_success_and_verify(self, base_url, admin_token, api_client):
        """Verify admin can add payout and it persists"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Get vendors list to find a valid vendor_id
        vendors_response = api_client.get(f"{base_url}/api/admin/payouts/vendors")
        assert vendors_response.status_code == 200
        vendors = vendors_response.json()
        assert len(vendors) > 0
        
        vendor_id = vendors[0]["vendor_id"]
        initial_paid = vendors[0]["total_paid"]
        
        # Add a test payout
        payout_amount = 250.50
        payout_note = "TEST_Payout_for_testing"
        add_response = api_client.post(f"{base_url}/api/admin/payouts/add", json={
            "vendor_id": vendor_id,
            "amount": payout_amount,
            "note": payout_note
        })
        assert add_response.status_code == 200
        
        payout_data = add_response.json()
        assert "payout_id" in payout_data
        assert payout_data["vendor_id"] == vendor_id
        assert payout_data["amount"] == payout_amount
        assert payout_data["note"] == payout_note
        assert "created_at" in payout_data
        
        # Verify payout persisted by checking vendor's total_paid increased
        vendors_after = api_client.get(f"{base_url}/api/admin/payouts/vendors")
        assert vendors_after.status_code == 200
        vendors_list = vendors_after.json()
        updated_vendor = next(v for v in vendors_list if v["vendor_id"] == vendor_id)
        
        expected_paid = round(initial_paid + payout_amount, 2)
        assert updated_vendor["total_paid"] == expected_paid

    def test_admin_payout_history_requires_auth(self, base_url, api_client):
        """Verify payout history requires authentication"""
        response = api_client.get(f"{base_url}/api/admin/payouts/vendor_test/history")
        assert response.status_code == 401

    def test_admin_payout_history_requires_admin(self, base_url, vendor_token, api_client):
        """Verify payout history requires admin role"""
        api_client.headers.update({"Authorization": f"Bearer {vendor_token}"})
        response = api_client.get(f"{base_url}/api/admin/payouts/vendor_test/history")
        assert response.status_code == 403

    def test_admin_payout_history_success(self, base_url, admin_token, api_client):
        """Verify admin can get payout history for a vendor"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Get vendors list to find a valid vendor_id
        vendors_response = api_client.get(f"{base_url}/api/admin/payouts/vendors")
        vendors = vendors_response.json()
        vendor_id = vendors[0]["vendor_id"]
        
        # Get payout history
        response = api_client.get(f"{base_url}/api/admin/payouts/{vendor_id}/history")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # If there are payouts, verify structure
        if len(data) > 0:
            payout = data[0]
            assert "amount" in payout
            assert "note" in payout
            assert "created_at" in payout
            assert isinstance(payout["amount"], (int, float))


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session
