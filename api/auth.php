<?php
// ═══════════════════════════════════════════════════
//  Commercial Dashboard — Shared Auth Layer
//  Include at the top of every API file:
//    require_once __DIR__ . '/auth.php';
// ═══════════════════════════════════════════════════

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 86400 * 7,   // 7 days
        'path'     => '/',
        'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',       // Lax works better with redirects than Strict
    ]);
    session_start();
}

function requireAuth(): void {
    if (!empty($_SESSION['user_id'])) return; // already authenticated

    // Always return JSON 401 for API endpoints — never redirect
    // The frontend fetch wrapper handles the redirect to login
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    // Detect dashboard root path for redirect hint
    $loginUrl = '/login.php';
    echo json_encode([
        'error'    => 'Not authenticated',
        'redirect' => $loginUrl,
    ]);
    exit;
}

function currentUser(): array {
    return [
        'id'    => $_SESSION['user_id']    ?? null,
        'name'  => $_SESSION['user_name']  ?? '',
        'email' => $_SESSION['user_email'] ?? '',
        'role'  => $_SESSION['user_role']  ?? 'viewer',
    ];
}

function isAdmin(): bool {
    return ($_SESSION['user_role'] ?? '') === 'admin';
}
