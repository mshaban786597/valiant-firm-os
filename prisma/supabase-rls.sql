-- Optional Supabase RLS (run after Prisma migrate).
-- Map Supabase auth.users to app User via public profiles or JWT claim `org_id`.
-- Example pattern: enable RLS and scope rows by organization_id.

-- ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY org_isolation ON "Lead"
--   USING (organization_id = current_setting('request.jwt.claim.org_id', true)::text);

-- Service role (Next.js server with SUPABASE_SERVICE_ROLE_KEY) bypasses RLS.
-- For MVP, app-layer checks via session org membership are sufficient until Supabase Auth is wired.
