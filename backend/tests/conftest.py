import pytest
import requests
import os

@pytest.fixture(scope="session")
def base_url():
    """Get base URL from environment"""
    url = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if not url:
        raise ValueError("EXPO_PUBLIC_BACKEND_URL not set in environment")
    return url.rstrip('/')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def admin_token(base_url):
    """Get admin access token for tests"""
    session = requests.Session()
    response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": "admin@perfectlygood.com", "password": "admin123"}
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code}")
    data = response.json()
    return data.get('access_token')

@pytest.fixture(scope="session")
def vendor_token(base_url):
    """Get vendor access token for tests"""
    session = requests.Session()
    response = session.post(
        f"{base_url}/api/auth/login",
        json={"email": "vendor@demo.com", "password": "vendor123"}
    )
    if response.status_code != 200:
        pytest.skip(f"Vendor login failed: {response.status_code}")
    data = response.json()
    return data.get('access_token')
