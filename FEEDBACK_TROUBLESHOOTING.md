# Feedback troubleshooting

If "Your feedback" fails to send, check the following.

## 1. Console errors (F12 → Console)

Open DevTools and try sending feedback. Look for:
- `[Lumi DB] Feedback failed: 404` → Table missing
- `[Lumi DB] Feedback failed: 403` → RLS blocking
- `[Lumi DB] Feedback failed: 422` → Schema/constraint issue
- `[Lumi DB] Feedback network error` → CORS or offline

## 2. Supabase setup

Run these in **Supabase → SQL Editor** (in order):

1. **Create feedback table** (if not exists):
   ```sql
   create table if not exists feedback (
     id         bigserial primary key,
     user_id    text references users(id),
     message    text not null,
     created_at timestamptz not null default now()
   );
   create index if not exists feedback_created_idx on feedback(created_at desc);
   ```

2. **Enable RLS and policy**:
   ```sql
   alter table feedback enable row level security;
   drop policy if exists "feedback_insert" on feedback;
   create policy "feedback_insert" on feedback for insert with check (true);
   ```

Or run `supabase/01_tables.sql` then `supabase/02_rls.sql`.  
If the table already exists: run `supabase/03_feedback_fix.sql` only.

## 3. CORS

Feedback is sent from the browser to your Supabase project. Supabase allows CORS from any origin for the anon key. If you host on a custom domain, ensure it's not blocked.

## 4. Users table

Feedback stores `user_id` (optional). If the user row doesn't exist in `users`, the app now upserts it before sending. If that fails, feedback is sent with `user_id: null` so the message still goes through.
