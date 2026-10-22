# TimeHive v0.1
A multi-tenant clock-in/clock-out web application starter.

## Setup
1. Create a Supabase project. In SQL Editor, run `supabase/schema.sql`.
2. Copy `.env.example` to `.env` and set project URL and publishable/anon key. Never put a service-role key in the frontend.
3. `npm install` and `npm run dev`.
4. In Supabase Authentication, create a test user. In SQL Editor, insert a tenant, a location with its tenant_id, and a profile with the auth user's UUID and tenant_id.
5. Deploy the frontend on an HTTPS host (e.g. Vercel or Netlify). GPS requires HTTPS or localhost.

## Current functionality
Authenticated employee sign-in, per-tenant branding display, tenant-filtered worksite selection, one-tap GPS permission/capture, server-authoritative time events, prevention of repeated in/out punches, and RLS-isolated records. Each employee is assigned to one tenant in this starter.

## Still to implement before client rollout
Super-admin provisioning, client administrator UI, tenant-scoped employee invitations, brand/logo upload with secured storage policies, timesheets and payroll exports, correction approvals/audit logs, PWA icons and offline UX, timezone/payroll policies, rate limits and abuse monitoring, and end-to-end tests. GPS readings are device-supplied and can be spoofed; don't treat them as proof of physical presence. Add consent/retention disclosures and consider legal/payroll requirements before production use.
