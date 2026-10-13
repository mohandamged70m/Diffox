-- Existing bindings must be reconnected using a verified GitHub identity.
-- Keeping existing rows preserves history; webhooks/workers ignore unverified bindings.
alter table installations add column if not exists verified_at timestamptz;
