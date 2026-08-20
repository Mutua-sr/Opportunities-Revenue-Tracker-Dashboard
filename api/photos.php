<?php
/* ═══════════════════════════════════════════════════════
   photos.php  —  Unsplash daily photo pool
   ───────────────────────────────────────────────────────
   • Fetches 30 photos across architecture / industrial /
     interior topics from the Unsplash API
   • Caches result as JSON on disk for 24 hours so the
     TV display never hits rate limits (free tier: 50/hr)
   • Returns JSON array of {url, title, credit} objects
     matching the format expected by appendSlides()

   SETUP:
     1. Register a free app at https://unsplash.com/developers
     2. Replace YOUR_UNSPLASH_CLIENT_ID below with your key
     3. Ensure the cache/ directory exists and is writable
        by the web server:   mkdir cache && chmod 755 cache
═══════════════════════════════════════════════════════ */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

/* ── CONFIG ── */
const UNSPLASH_CLIENT_ID = getenv('UNSPLASH_CLIENT_ID') ?: 'YOUR_UNSPLASH_CLIENT_ID';
const CACHE_FILE         = __DIR__ . '/cache/photos_cache.json';
const CACHE_TTL          = 86400; // 24 hours in seconds
const PHOTO_WIDTH        = 1920;
const PHOTO_QUALITY      = 88;

/* ── TOPICS & HOW MANY PHOTOS PER TOPIC ── */
const TOPICS = [
  ['query' => 'parametric architecture building',   'count' => 8],
  ['query' => 'brutalist concrete architecture',     'count' => 5],
  ['query' => 'urban nightscape cityscape',          'count' => 5],
  ['query' => 'industrial port infrastructure',      'count' => 5],
  ['query' => 'modern interior design studio',       'count' => 4],
  ['query' => 'structural engineering construction', 'count' => 3],
];

/* ── SERVE FROM CACHE IF FRESH ── */
if (
  file_exists(CACHE_FILE) &&
  (time() - filemtime(CACHE_FILE)) < CACHE_TTL
) {
  echo file_get_contents(CACHE_FILE);
  exit;
}

/* ── FETCH FRESH FROM UNSPLASH ── */
$photos = [];
$seen   = [];

foreach (TOPICS as $topic) {
  $url = sprintf(
    'https://api.unsplash.com/search/photos?query=%s&per_page=%d&orientation=landscape&order_by=relevant',
    urlencode($topic['query']),
    $topic['count'] * 2   // fetch 2× so we can filter landscape-only
  );

  $ctx = stream_context_create([
    'http' => [
      'header'  => "Authorization: Client-ID " . UNSPLASH_CLIENT_ID . "\r\n",
      'timeout' => 8,
    ]
  ]);

  $raw = @file_get_contents($url, false, $ctx);
  if (!$raw) continue;

  $data = json_decode($raw, true);
  if (empty($data['results'])) continue;

  $added = 0;
  foreach ($data['results'] as $photo) {
    if ($added >= $topic['count']) break;
    if (isset($seen[$photo['id']])) continue;

    // Only use photos wider than tall (true landscape)
    $w = $photo['width']  ?? 0;
    $h = $photo['height'] ?? 0;
    if ($h === 0 || ($w / $h) < 1.4) continue;

    $seen[$photo['id']] = true;
    $photographer = $photo['user']['name'] ?? 'Unknown';
    $desc         = $photo['description'] ?? $photo['alt_description'] ?? $topic['query'];
    $desc         = ucfirst(strtolower(trim($desc)));
    if (strlen($desc) > 60) $desc = substr($desc, 0, 57) . '…';

    $photos[] = [
      'url'    => sprintf(
        '%s?w=%d&q=%d&fit=crop&crop=entropy',
        $photo['urls']['raw'],
        PHOTO_WIDTH,
        PHOTO_QUALITY
      ),
      'title'  => $desc ?: ucwords(str_replace('-', ' ', $topic['query'])),
      'credit' => $photographer . ' · Unsplash',
    ];

    $added++;
  }
}

/* ── FALLBACK: return curated seed if API failed ── */
if (empty($photos)) {
  http_response_code(503);
  echo json_encode(['error' => 'Unsplash unavailable — TV will use curated seed photos']);
  exit;
}

/* ── SHUFFLE & CACHE ── */
shuffle($photos);
$json = json_encode($photos, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

// Write cache (silently skip if directory not writable)
$cacheDir = dirname(CACHE_FILE);
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
@file_put_contents(CACHE_FILE, $json);

echo $json;
