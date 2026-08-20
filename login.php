<?php
// ═══════════════════════════════════════════════════
//  Commercial Dashboard — Login Page
//  Place at: /login.php  (dashboard root)
// ═══════════════════════════════════════════════════

ini_set('display_errors', '0');
require_once __DIR__ . '/api/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 86400 * 7,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

// Already logged in → go to dashboard
if (!empty($_SESSION['user_id'])) {
    // Redirect to current directory (where index.html lives)
    header('Location: /');
    exit;
}

$error = '';
$next  = $_GET['next'] ?? '/';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email    = trim($_POST['email']    ?? '');
    $password =      $_POST['password'] ?? '';

    if ($email && $password) {
        try {
            $stmt = db()->prepare(
                "SELECT id, name, email, password, role FROM users WHERE email = ? AND active = 1 LIMIT 1"
            );
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user && password_verify($password, $user['password'])) {
                // Regenerate session ID to prevent fixation
                session_regenerate_id(true);

                $_SESSION['user_id']    = $user['id'];
                $_SESSION['user_name']  = $user['name'];
                $_SESSION['user_email'] = $user['email'];
                $_SESSION['user_role']  = $user['role'];

                // Update last_login
                db()->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")
                    ->execute([$user['id']]);

                // Redirect to next page or current directory
                $safeNext = ($next && str_starts_with($next, '/')) ? $next : '/';
                $redirect = $safeNext;
                header('Location: ' . $redirect);
                exit;
            } else {
                $error = 'Invalid email or password.';
                // Small delay to slow brute force
                sleep(1);
            }
        } catch (Exception $e) {
            $error = 'Login error — please try again.';
        }
    } else {
        $error = 'Please enter your email and password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — Commercial Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f4f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border: 1px solid #e2e0d8;
      border-radius: 14px;
      padding: 40px 36px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 4px 24px rgba(0,0,0,.07);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
    }
    .logo-mark {
      width: 38px; height: 38px;
      background: #1a5c38;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 800; color: #fff;
      letter-spacing: -.02em;
    }
    .logo-text { font-size: 15px; font-weight: 700; color: #1a1a18; line-height: 1.2; }
    .logo-sub  { font-size: 11px; color: #8a8880; font-weight: 400; }
    h1 { font-size: 20px; font-weight: 700; color: #1a1a18; margin-bottom: 6px; }
    .sub { font-size: 13px; color: #8a8880; margin-bottom: 28px; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 11px; font-weight: 700; color: #4a4a48; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 6px; }
    input[type=email], input[type=password] {
      width: 100%;
      padding: 10px 13px;
      font-size: 14px;
      border: 1.5px solid #dddbd3;
      border-radius: 8px;
      background: #faf9f7;
      color: #1a1a18;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    input:focus {
      border-color: #1a5c38;
      box-shadow: 0 0 0 3px rgba(26,92,56,.1);
      background: #fff;
    }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      font-size: 13px;
      padding: 10px 13px;
      border-radius: 8px;
      margin-bottom: 18px;
    }
    button[type=submit] {
      width: 100%;
      padding: 11px;
      background: #1a5c38;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background .15s;
      margin-top: 4px;
    }
    button[type=submit]:hover { background: #155030; }
    .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #aaa9a4; }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-mark">S</div>
    <div>
      <div class="logo-text">Example Organisation</div>
      <div class="logo-sub">Commercial Dashboard · 2026</div>
    </div>
  </div>

  <h1>Sign in</h1>
  <p class="sub">Enter your credentials to access the dashboard.</p>

  <?php if ($error): ?>
    <div class="error">⚠ <?= htmlspecialchars($error) ?></div>
  <?php endif; ?>

  <form method="POST" action="?next=<?= htmlspecialchars(urlencode($next)) ?>">
    <div class="field">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autofocus
             value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
             placeholder="you@example.com">
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required placeholder="••••••••">
    </div>
    <button type="submit">Sign in →</button>
  </form>

  <div class="footer">Contact your administrator to reset your password</div>
</div>
</body>
</html>
