-- ReviewKit MVP schema (Supabase Postgres).
-- Run: supabase db push, or paste into the Supabase SQL editor.
-- All privileged access uses the service-role key server-side.
-- RLS is enabled with owner-only policies as defense-in-depth.

create extension if not exists "pgcrypto";

-- One row per Clerk user.
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  created_at timestamptz not null default now()
);

-- Encrypted AI credentials per account (one OpenAI-compatible provider in MVP).
-- key_enc holds the AES-256-GCM envelope {v, iv, tag, data}. Plaintext never stored.
create table if not exists ai_configs (
  account_id uuid primary key references accounts(id) on delete cascade,
  provider text not null default 'opencode-zen',
  model text not null,
  key_enc jsonb not null,
  key_masked text not null,
  status text not null default 'active' check (status in ('active','invalid','error')),
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- GitHub App installations connected by the user.
create table if not exists installations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null default 'User',
  created_at timestamptz not null default now(),
  unique (account_id, installation_id)
);

-- Repositories visible under an installation.
create table if not exists repositories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  installation_id bigint not null,
  github_repo_id bigint not null,
  full_name text not null,
  auto_review boolean not null default true,
  excluded_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, github_repo_id)
);
create index if not exists repositories_account_idx on repositories(account_id);

-- Reviews of pull requests.
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  repository_id uuid references repositories(id) on delete set null,
  repo_full_name text not null,
  pr_number integer not null,
  head_sha text not null,
  base_sha text,
  prev_head_sha text,
  mode text not null default 'full' check (mode in ('full','incremental')),
  status text not null default 'queued'
    check (status in ('queued','running','completed','skipped','superseded','failed')),
  summary text,
  incomplete boolean not null default false,
  incomplete_reason text,
  skipped_files jsonb not null default '[]',
  github_review_id bigint,
  github_pr_url text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists reviews_account_idx on reviews(account_id, updated_at desc);
create index if not exists reviews_pr_idx on reviews(repo_full_name, pr_number, head_sha);

-- Structured findings per review.
create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  file text,
  line integer,
  severity text not null check (severity in ('critical','high','medium','low','info')),
  title text not null,
  explanation text not null,
  suggestion text not null,
  evidence text,
  inline_posted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists findings_review_idx on findings(review_id);

-- Durable job queue (one row per review task).
create table if not exists review_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  review_id uuid references reviews(id) on delete cascade,
  repo_full_name text not null,
  pr_number integer not null,
  head_sha text not null,
  status text not null default 'queued'
    check (status in ('queued','running','completed','skipped','superseded','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  lease_expires_at timestamptz,
  claimed_by text,
  last_error text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dedupe_key)
);
create index if not exists review_jobs_claim_idx on review_jobs(status, lease_expires_at, created_at);

-- Webhook delivery dedupe (GitHub X-GitHub-Delivery IDs).
create table if not exists webhook_deliveries (
  delivery_id text primary key,
  event text not null,
  action text,
  created_at timestamptz not null default now()
);

-- Row-level security: deny anon by default; service role bypasses RLS.
alter table accounts enable row level security;
alter table ai_configs enable row level security;
alter table installations enable row level security;
alter table repositories enable row level security;
alter table reviews enable row level security;
alter table findings enable row level security;
alter table review_jobs enable row level security;
alter table webhook_deliveries enable row level security;

-- No public policies: all dashboard access goes through server routes with the
-- service-role key + Clerk ownership checks (lib/auth.ts). This keeps RLS
-- deny-by-default while the server enforces account ownership per row.
