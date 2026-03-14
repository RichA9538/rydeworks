// ============================================================
// ZAK TRANSPORT — Shared Auth Utilities
// ============================================================

const ZakAuth = {
  getToken() { return localStorage.getItem('zak_token'); },
  getUser()  { return JSON.parse(localStorage.getItem('zak_user') || 'null'); },

  isLoggedIn() { return !!this.getToken(); },

  hasRole(role) {
    const user = this.getUser();
    if (!user) return false;
    return (user.roles || []).includes(role) || (user.roles || []).includes('super_admin');
  },

  // Redirect to login if not authenticated
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  // Redirect to login if missing required role
  requireRole(role) {
    if (!this.requireAuth()) return false;
    if (!this.hasRole(role)) {
      alert('You do not have permission to access this page.');
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  logout() {
    localStorage.removeItem('zak_token');
    localStorage.removeItem('zak_user');
    window.location.href = '/login.html';
  },

  // Fetch wrapper that includes auth header
  async apiFetch(url, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });

    // Auto-logout on 401
    if (res.status === 401) {
      this.logout();
      return null;
    }
    return res.json();
  }
};

// Populate user info in nav if elements exist
document.addEventListener('DOMContentLoaded', () => {
  const user = ZakAuth.getUser();
  if (!user) return;

  const nameEl = document.getElementById('nav-user-name');
  const roleEl = document.getElementById('nav-user-role');
  const avatarEl = document.getElementById('nav-user-avatar');

  if (nameEl) nameEl.textContent = `${user.firstName} ${user.lastName}`;
  if (roleEl) {
    const roleLabels = {
      super_admin: 'Super Admin',
      admin: 'Administrator',
      dispatcher: 'Dispatcher',
      driver: 'Driver'
    };
    const primary = user.roles?.includes('super_admin') ? 'super_admin'
                  : user.roles?.includes('admin')       ? 'admin'
                  : user.roles?.includes('dispatcher')  ? 'dispatcher'
                  : 'driver';
    roleEl.textContent = roleLabels[primary] || primary;
  }
  if (avatarEl) {
    avatarEl.textContent = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  }
});
