<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rydeworks — Redirecting...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0A1628;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      padding: 40px 20px;
    }
    .logo {
      width: 64px;
      height: 64px;
      background: #00D4C8;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
    }
    h1 { font-size: 1.6rem; margin-bottom: 8px; }
    p { color: rgba(255,255,255,0.5); font-size: 0.95rem; margin-bottom: 32px; }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(0,212,200,0.2);
      border-top-color: #00D4C8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .links {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 280px;
      margin: 0 auto;
    }
    .link-btn {
      display: block;
      padding: 14px 20px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      transition: opacity 0.2s;
    }
    .link-btn:hover { opacity: 0.85; }
    .btn-driver   { background: #00D4C8; color: #0A1628; }
    .btn-dispatch { background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); }
    .btn-enroll   { background: transparent; color: rgba(255,255,255,0.5); font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🚐</div>
    <h1>Rydeworks</h1>
    <p id="statusText">Checking your account...</p>
    <div class="spinner" id="spinner"></div>
    <div class="links" id="links" style="display:none;">
      <a href="/driver.html" class="link-btn btn-driver">🚐 Driver App</a>
      <a href="/app.html" class="link-btn btn-dispatch">📋 Dispatch Center</a>
      <a href="/enroll" class="link-btn btn-enroll">Rider enrollment →</a>
    </div>
  </div>

  <script>
    (function() {
      const token = localStorage.getItem('zak_token');
      const user  = JSON.parse(localStorage.getItem('zak_user') || '{}');

      if (!token) {
        // Not logged in — go to login
        window.location.replace('/login.html');
        return;
      }

      const roles = user.roles || [];

      // Driver-only → driver app
      if (roles.includes('driver') && !roles.includes('admin') && !roles.includes('dispatcher')) {
        window.location.replace('/driver.html');
        return;
      }

      // Admin or dispatcher → dispatch app
      if (roles.includes('admin') || roles.includes('dispatcher')) {
        window.location.replace('/app.html');
        return;
      }

      // Has driver role among others → show choice
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('statusText').textContent = 'Where would you like to go?';
      document.getElementById('links').style.display = 'flex';
    })();
  </script>
</body>
</html>
