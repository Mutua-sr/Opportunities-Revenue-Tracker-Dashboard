<?php
if (session_status() === PHP_SESSION_NONE) session_start();
$_SESSION = [];
session_destroy();
setcookie(session_name(), '', time() - 3600, '/');
// Redirect to login in same directory
header('Location: /login.php');
exit;
