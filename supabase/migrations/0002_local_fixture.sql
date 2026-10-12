-- Phase 4: local test mode fixture input (never used by the GitHub path).
alter table reviews add column if not exists fixture_diff text;
