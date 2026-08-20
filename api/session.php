<?php
// ═══════════════════════════════════════════════════
//  SDG — Session info endpoint
//  GET /api/session.php → returns current user role
//  Upload to /api/session.php
// ═══════════════════════════════════════════════════
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';
requireAuth();

header('Content-Type: application/json; charset=utf-8');
echo json_encode(currentUser());
