# Commercial Dashboard

## Hosting Setup

### Requirements
- PHP 7.4+ with PDO and PDO_MySQL extensions
- MySQL 5.7+ or MariaDB 10.3+
- Apache with mod_rewrite, mod_headers, mod_deflate (standard on most hosts)

### Steps

**1. Upload files**
Upload the entire folder to your web hosting public directory (e.g. `public_html/sdg-dashboard/`).

**2. Create database**
In your hosting control panel (cPanel, Plesk, etc.) create a MySQL database and user.

**3. Run the schema**
Import `api/schema.sql` using phpMyAdmin or run:
```
mysql -u YOUR_USER -p YOUR_DATABASE < api/schema.sql
```

**4. Configure database credentials**
```bash
cp api/config.example.php api/config.php
```
Then edit `api/config.php` (it is gitignored — never commit it):
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');
```
Alternatively set environment variables: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`.

**5. Seed the database**
Run the seeder once to populate the database from the Excel data:
```
php api/seed.php
```
Run it from the command line, not the browser. Anything that writes to the
database should not be reachable over HTTP.

**6. Create the first user**
```bash
cp api/create_user.php.example api/create_user.php
php api/create_user.php "Your Name" you@example.com admin
rm api/create_user.php
```
CLI-only by design: it refuses to run over HTTP, prompts for the password
rather than taking it as an argument (so it stays out of shell history), and
never echoes it back.

**7. Optional — Unsplash photos for the TV display**
Register a free app at https://unsplash.com/developers and set
`UNSPLASH_CLIENT_ID` as an environment variable. Without it, `api/photos.php`
falls back to the curated seed list in `tv_display_v8.html`.

**8. Open the dashboard**
Visit `yourdomain.com/sdg-dashboard/` — the dashboard will automatically connect to the database.

---

## How live updates work
- The dashboard loads data from `api/deals.php` on every page visit.
- It silently re-fetches data every **5 minutes** while open.
- When a deal is added, edited or deleted via the dashboard, the change hits the database immediately and the current page re-renders within seconds.
- If the API is unreachable, the dashboard falls back to the bundled seed data automatically.

## API Endpoints
| Method | URL | Action |
|--------|-----|--------|
| GET | `api/deals.php` | All deals |
| GET | `api/deals.php?id=5` | Single deal |
| POST | `api/deals.php` | Create deal |
| PUT | `api/deals.php?id=5` | Update deal |
| DELETE | `api/deals.php?id=5` | Delete deal |

## File structure
```
index.html          Main dashboard
styles.css          All styles
.htaccess           Apache config (caching, security, CORS)
js/
  seed-data.js      Bundled fallback data (88 deals)
  data.js           API layer + auto-refresh
  pages.js          All page rendering
  ...               Other JS modules
api/
  config.php        Database credentials  ← EDIT THIS
  deals.php         REST API
  schema.sql        Database schema
  seed.php          One-time seeder
```

---

## Security notes

- **`api/config.php` is gitignored.** Never commit real credentials.
- **Serve the API from the same origin as the front end.** Auth is a session
  cookie, and `Access-Control-Allow-Origin: *` forbids credentialed requests.
- **Delete one-shot setup scripts after use.** Anything that creates users or
  seeds data must not stay in a web-accessible directory.
- **Don't add unauthenticated diagnostic endpoints.** A page printing PHP
  version, document root, database name and table row counts is reconnaissance
  for anyone who finds it. If you need one, put it behind `requireAuth()` and
  gitignore it.

## Demo data

`js/seed-data.js` and `REALIZED_REVENUE_SEED` in `js/constants.js` hold
**synthetic** deals, clients, contacts, values and invoices — the fallback used
when the API is unreachable. Revenue targets in `js/constants.js` and partner
names in `js/pages.js` are likewise placeholders.

Replace them with your own and keep real pipeline data out of the repo. Client
names, contact details, deal values and win probabilities belong in the
database, not in version control.

## Licence

Add one before publishing.
