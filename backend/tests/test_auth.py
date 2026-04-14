import pytest
import requests

class TestAuth:
    """Authentication endpoint tests"""

    def test_login_admin_success(self, base_url, api_client):
        """Test admin login returns user object with access_token"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "admin@perfectlygood.com", "password": "admin123"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert "user_id" in data, "Response missing user_id"
        assert "email" in data, "Response missing email"
        assert data["email"] == "admin@perfectlygood.com"
        assert data["role"] == "admin"
        print(f"✓ Admin login successful: {data['email']} (role: {data['role']})")

    def test_login_vendor_success(self, base_url, api_client):
        """Test vendor login returns user object with access_token"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "vendor@demo.com", "password": "vendor123"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert data["email"] == "vendor@demo.com"
        assert data["role"] == "vendor"
        print(f"✓ Vendor login successful: {data['email']} (role: {data['role']})")

    def test_login_invalid_credentials(self, base_url, api_client):
        """Test login with invalid credentials returns 401"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "admin@perfectlygood.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials rejected with 401")

    def test_register_new_user(self, base_url, api_client):
        """Test user registration creates new user and returns access_token"""
        import time
        email = f"TEST_user_{int(time.time())}@test.com"
        
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "name": "Test User",
                "email": email,
                "password": "test1234"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert data["email"] == email.lower(), "Email should be normalized to lowercase"
        assert data["role"] == "user"
        print(f"✓ User registration successful: {email}")
        
        # Verify user can login
        login_response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": email, "password": "test1234"}
        )
        assert login_response.status_code == 200, "Newly registered user cannot login"
        print(f"✓ Newly registered user can login")

    def test_register_duplicate_email(self, base_url, api_client):
        """Test registration with existing email returns 400"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "name": "Duplicate",
                "email": "admin@perfectlygood.com",
                "password": "test1234"
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Duplicate email registration rejected with 400")

    def test_auth_me_with_token(self, base_url, admin_token):
        """Test /auth/me returns user data with valid token"""
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        response = session.get(f"{base_url}/api/auth/me")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["email"] == "admin@perfectlygood.com"
        assert data["role"] == "admin"
        print(f"✓ /auth/me returns correct user data")

    def test_auth_me_without_token(self, base_url, api_client):
        """Test /auth/me returns 401 without token"""
        response = api_client.get(f"{base_url}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ /auth/me rejects unauthenticated request with 401")

    def test_logout(self, base_url, api_client):
        """Test logout endpoint"""
        response = api_client.post(f"{base_url}/api/auth/logout")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "message" in data
        print("✓ Logout successful")
