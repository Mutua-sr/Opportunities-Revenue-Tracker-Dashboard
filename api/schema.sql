-- ═══════════════════════════════════════════════════════════════
--  Commercial Dashboard — MySQL Schema  (v2, production)
--
--  HOW TO USE:
--    1. Create your database first (or use the CREATE DATABASE below)
--    2. Run:  mysql -u USER -p DATABASE < api/schema.sql
--    3. Then seed:  php api/seed.php
--
--  Compatible with MySQL 5.7+, MySQL 8+, MariaDB 10.3+
-- ═══════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS deals (
  id                   INT UNSIGNED      AUTO_INCREMENT PRIMARY KEY,

  -- Core
  dealName             VARCHAR(400)      NOT NULL DEFAULT '',
  client               VARCHAR(255)      NOT NULL DEFAULT '',
  dealStage            VARCHAR(100)      NOT NULL DEFAULT '',
  projectStage         VARCHAR(100)      NOT NULL DEFAULT '',
  status               VARCHAR(20)       NOT NULL DEFAULT 'Open',
  prioritization       VARCHAR(50)       NOT NULL DEFAULT '',

  -- Commercial
  estimatedValue       DECIMAL(18,2)     NOT NULL DEFAULT 0.00,
  probability          DECIMAL(7,4)      NOT NULL DEFAULT 0.0000,

  weightedValue        DECIMAL(20,2)     NOT NULL DEFAULT 0.00,

  -- Probability sub-scores
  dealLikelihood       DECIMAL(5,4)      NOT NULL DEFAULT 0.5000,
  stageProgress        DECIMAL(5,4)      NOT NULL DEFAULT 0.3000,
  dealAttributes       DECIMAL(5,4)      NOT NULL DEFAULT 0.6000,
  engagementTiming     DECIMAL(5,4)      NOT NULL DEFAULT 0.2500,
  historicalSuccess    DECIMAL(5,4)      NOT NULL DEFAULT 0.1000,
  competitorLandscape  DECIMAL(5,4)      NOT NULL DEFAULT 0.0500,

  -- Classification
  division             VARCHAR(10)       NOT NULL DEFAULT '',
  divisionLabel        VARCHAR(100)      NOT NULL DEFAULT '',
  portfolio          VARCHAR(100)      NOT NULL DEFAULT '',
  dealSource           VARCHAR(100)      NOT NULL DEFAULT '',
  origin               VARCHAR(100)      NOT NULL DEFAULT '',
  country              VARCHAR(100)      NOT NULL DEFAULT '',

  -- People
  dealOwnership        VARCHAR(150)      NOT NULL DEFAULT '',
  resourceName         VARCHAR(150)      NOT NULL DEFAULT '',
  contactName          VARCHAR(150)      NOT NULL DEFAULT '',
  phone                VARCHAR(80)       NOT NULL DEFAULT '',
  role                 VARCHAR(150)      NOT NULL DEFAULT '',
  buyingCentre         VARCHAR(100)      NOT NULL DEFAULT '',

  -- Dates
  entryDate            VARCHAR(30)       NOT NULL DEFAULT '',
  startDate            VARCHAR(30)       NOT NULL DEFAULT '',
  proposalDate         VARCHAR(30)       NOT NULL DEFAULT '',
  signoffDate          VARCHAR(30)       NOT NULL DEFAULT '',
  projectDuration      VARCHAR(60)       NOT NULL DEFAULT '',

  -- Notes
  comments             TEXT,

  -- Audit
  createdAt            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_status     (status),
  INDEX idx_division   (division),
  INDEX idx_stage      (dealStage(50)),
  INDEX idx_owner      (dealOwnership(50)),
  INDEX idx_country    (country(50)),
  INDEX idx_updated    (updatedAt)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════
--  REALIZED REVENUE  (running contracts & earned revenue)
--
--  Source: 2026_Running_Contracts.xlsx → EarnedRevenue sheet
--  Schema version: 1  (2026-03)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS realized_revenue (
  id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,

  -- Invoice identity
  project        VARCHAR(400)   NOT NULL DEFAULT '',
  client         VARCHAR(255)   NOT NULL DEFAULT '',
  description    VARCHAR(500)   NOT NULL DEFAULT '',

  -- Classification
  division       VARCHAR(20)    NOT NULL DEFAULT '',   -- DM|CI|MF|EA|ALM|OTHER
  divisionName   VARCHAR(100)   NOT NULL DEFAULT '',
  billingEntity  VARCHAR(50)    NOT NULL DEFAULT '',   -- SDG|GCL|SEP|SDG-UAE …

  -- Link back to the pipeline deal that generated this work (nullable)
  dealId         VARCHAR(30)    NULL DEFAULT NULL,      -- FK → deals.id

  -- Amounts (KES is canonical; USD stored for reference)
  amountKES      DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
  amountUSD      DECIMAL(14,2)  NOT NULL DEFAULT 0.00,

  -- Dates
  invoiceDate    DATE           NULL,
  paymentDate    DATE           NULL,

  -- Status
  status         ENUM('Paid','Pending','Running')  NOT NULL DEFAULT 'Running',

  -- Audit
  createdAt      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_rr_status   (status),
  INDEX idx_rr_division (division),
  INDEX idx_rr_dealid   (dealId),
  INDEX idx_rr_invoice  (invoiceDate),
  INDEX idx_rr_updated  (updatedAt)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════
--  CONTRACTS  (one row per Won deal — the bridge layer)
--
--  When a deal is marked Won it is promoted here automatically.
--  contractId format: CON-YYYY-{dealId zero-padded to 3}
--  Pre-populated with all existing won deals at migration time.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contracts (
  id               VARCHAR(30)    PRIMARY KEY,     -- CON-2026-003 etc.
  dealId           VARCHAR(30)    NOT NULL,         -- FK → deals.id
  dealName         VARCHAR(400)   NOT NULL DEFAULT '',
  client           VARCHAR(255)   NOT NULL DEFAULT '',
  division         VARCHAR(10)    NOT NULL DEFAULT '',
  divisionName     VARCHAR(100)   NOT NULL DEFAULT '',
  contractValue    DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
  signoffDate      VARCHAR(30)    NOT NULL DEFAULT '',
  startDate        VARCHAR(30)    NOT NULL DEFAULT '',
  projectDuration  VARCHAR(60)    NOT NULL DEFAULT '',
  dealOwnership    VARCHAR(150)   NOT NULL DEFAULT '',
  country          VARCHAR(100)   NOT NULL DEFAULT '',
  status           ENUM('Active','Completed','Suspended') NOT NULL DEFAULT 'Active',
  notes            TEXT,
  createdAt        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_con_dealid   (dealId),
  INDEX idx_con_division (division),
  INDEX idx_con_status   (status)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: add dealId to realized_revenue if upgrading from an older version
-- Safe to run repeatedly (IF NOT EXISTS)
ALTER TABLE realized_revenue
  ADD COLUMN IF NOT EXISTS dealId VARCHAR(30) NULL DEFAULT NULL AFTER billingEntity,
  ADD INDEX IF NOT EXISTS idx_rr_dealid (dealId);

-- Add lossReason to deals (safe migration)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lossReason VARCHAR(100) NOT NULL DEFAULT '';
