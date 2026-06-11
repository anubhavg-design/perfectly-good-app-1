"""Tests for order pricing with GST (5%) + Convenience Fee (5%)."""
import requests


class TestOrderPricing:
    """Verify create_order returns amount = round(subtotal*1.10)*100 (paise)
    and pending_orders.total_amount = subtotal * 1.10
    """

    def _login_user_session(self, base_url, email, password):
        s = requests.Session()
        r = s.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, f"login failed: {r.text}"
        token = r.json().get("access_token")
        s.headers.update({"Authorization": f"Bearer {token}"})
        return s

    def test_pricing_amount_qty_1(self, base_url, admin_token):
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {admin_token}"})
        drops = s.get(f"{base_url}/api/drops").json()
        assert len(drops) > 0
        drop = drops[0]
        price = drop["discounted_price"]

        r = s.post(f"{base_url}/api/orders/create",
                   json={"food_item_id": drop["item_id"], "quantity": 1})
        assert r.status_code == 200, r.text
        data = r.json()

        subtotal = price * 1
        gst = round(subtotal * 0.05, 2)
        conv = round(subtotal * 0.05, 2)
        expected_total = round(subtotal + gst + conv, 2)
        expected_paise = int(expected_total * 100)

        assert data["amount"] == expected_paise, (
            f"amount mismatch: got {data['amount']}, expected {expected_paise} "
            f"(price={price}, subtotal={subtotal}, gst={gst}, conv={conv}, total={expected_total})"
        )
        # 10% surcharge check (5% + 5%)
        assert abs(data["amount"] / 100.0 - subtotal * 1.10) < 0.02
        print(f"✓ qty=1 price={price} subtotal={subtotal} total={expected_total} paise={data['amount']}")

    def test_pricing_amount_qty_2(self, base_url, admin_token):
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {admin_token}"})
        drops = s.get(f"{base_url}/api/drops").json()
        drop = drops[0]
        price = drop["discounted_price"]

        r = s.post(f"{base_url}/api/orders/create",
                   json={"food_item_id": drop["item_id"], "quantity": 2})
        assert r.status_code == 200, r.text
        data = r.json()

        subtotal = price * 2
        gst = round(subtotal * 0.05, 2)
        conv = round(subtotal * 0.05, 2)
        expected_total = round(subtotal + gst + conv, 2)
        expected_paise = int(expected_total * 100)

        assert data["amount"] == expected_paise, (
            f"amount mismatch qty=2: got {data['amount']}, expected {expected_paise}"
        )
        print(f"✓ qty=2 subtotal={subtotal} total={expected_total} paise={data['amount']}")

    def test_pricing_pending_order_total_persisted(self, base_url, admin_token):
        """After create, verify+verify returns persisted total_amount = subtotal*1.10."""
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {admin_token}"})
        drops = s.get(f"{base_url}/api/drops").json()
        drop = drops[0]
        price = drop["discounted_price"]
        qty = 1

        create = s.post(f"{base_url}/api/orders/create",
                        json={"food_item_id": drop["item_id"], "quantity": qty}).json()

        verify = s.post(f"{base_url}/api/orders/verify", json={
            "razorpay_order_id": create["razorpay_order_id"],
            "razorpay_payment_id": "pay_mock_price",
            "razorpay_signature": "sig_mock_price",
            "food_item_id": drop["item_id"],
            "quantity": qty,
        })
        assert verify.status_code == 200, verify.text
        order_id = verify.json()["order_id"]

        orders = s.get(f"{base_url}/api/orders/user").json()
        order = next((o for o in orders if o["order_id"] == order_id), None)
        assert order is not None

        subtotal = price * qty
        expected_total = round(subtotal * 1.10, 2)
        assert abs(order["total_amount"] - expected_total) < 0.02, (
            f"persisted total_amount {order['total_amount']} != expected {expected_total}"
        )
        print(f"✓ persisted total_amount={order['total_amount']} (expected {expected_total})")

        # Cleanup: cancel order so seed quantities aren't depleted across runs
        s.put(f"{base_url}/api/orders/{order_id}/cancel")
