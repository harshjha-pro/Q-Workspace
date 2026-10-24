-- One Bhilwara — production data model (PostgreSQL / Supabase).
-- Mirrors src/types/models.ts. Apply with: supabase db push (or psql -f schema.sql).
-- Row-level security (RLS) is enabled on every table; policies below are a starting point
-- and MUST be reviewed before launch. Privileged actions go through the admin role check.

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type app_role as enum ('resident','business','provider','jobseeker','employer','owner','admin');
create type verification as enum ('unverified','submitted','under_review','verified','rejected','suspended');
create type request_status as enum ('open','responded','confirmed','in_progress','completed','cancelled');
create type application_status as enum ('submitted','under_review','shortlisted','interview','selected','rejected','withdrawn');
create type case_status as enum ('open','reviewing','actioned','dismissed');

-- ---------- Reference ----------
create table localities (
  id text primary key, name text not null, name_hi text not null, zone text not null, active boolean not null default true
);

create table platform_settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by uuid
);

-- ---------- Users & roles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  mobile text check (mobile ~ '^[6-9][0-9]{9}$'),
  email text,
  locality_id text references localities(id),
  bio text check (char_length(bio) <= 300),
  interests text[] not null default '{}',
  status text not null default 'active' check (status in ('active','suspended')),
  privacy jsonb not null default '{"showContact":false,"profilePublic":true,"personalisedFeed":true}',
  created_at timestamptz not null default now(), updated_at timestamptz
);

-- Roles live in their own table so users cannot grant themselves roles by editing profiles.
create table user_roles (
  user_id uuid references profiles(id) on delete cascade, role app_role not null, granted_by uuid references profiles(id), granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create or replace function is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin');
$$;

create table user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  lang text not null default 'en' check (lang in ('en','hi')),
  locality_ids text[] not null default '{}', news_categories text[] not null default '{}', job_categories text[] not null default '{}',
  home_sections text[] not null default '{}', notify_categories text[] not null default '{}', updated_at timestamptz not null default now()
);

create table candidate_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  headline text, education text, skills text[] not null default '{}', experience_years int not null default 0 check (experience_years >= 0),
  preferred_role text, preferred_salary int, preferred_locality_id text references localities(id), availability text,
  resume_path text, -- private storage bucket path; never public
  visibility text not null default 'private' check (visibility in ('employers','private'))
);

create table blocks (user_id uuid references profiles(id) on delete cascade, blocked_id uuid references profiles(id) on delete cascade, created_at timestamptz default now(), primary key (user_id, blocked_id));

-- ---------- Businesses ----------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null, description text not null, address text not null, locality_id text references localities(id),
  phone text, website text check (website is null or website like 'https://%'), instagram text, facebook text,
  hours text, price_range smallint check (price_range between 1 and 4), products text[] not null default '{}',
  verification verification not null default 'unverified', premium boolean not null default false, b2b boolean not null default false, wedding_category text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create table business_members (business_id uuid references businesses(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, role text not null default 'owner', primary key (business_id, user_id));
create table verification_requests (
  id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id) on delete cascade, submitted_by uuid references profiles(id),
  document_paths text[] not null, kind text not null default 'verification' check (kind in ('verification','claim')),
  status verification not null default 'submitted', reviewer_id uuid references profiles(id), note text, created_at timestamptz not null default now()
);
create table business_metrics_daily (business_id uuid references businesses(id) on delete cascade, day date not null, views int default 0, clicks int default 0, leads int default 0, primary key (business_id, day));

create table offers (
  id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id) on delete cascade, title text not null, description text, benefit text not null,
  category text, valid_from date not null, valid_to date not null check (valid_to >= valid_from), terms text[] not null default '{}', redemption text,
  sponsored boolean not null default false, status text not null default 'active' check (status in ('active','paused','expired')), created_at timestamptz not null default now()
);
create table voucher_claims (
  id uuid primary key default gen_random_uuid(), offer_id uuid references offers(id) on delete cascade, user_id uuid references profiles(id) on delete cascade,
  code text not null unique, status text not null default 'claimed' check (status in ('claimed','redeemed','expired')), claimed_at timestamptz not null default now(),
  unique (offer_id, user_id)
);

create table ad_campaigns (
  id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id) on delete cascade, objective text not null, placement text not null,
  locality_id text, category text, start_date date not null, end_date date not null check (end_date > start_date), budget int not null check (budget >= 0),
  headline text not null, creative_path text, status text not null default 'pending_review', created_at timestamptz not null default now()
);
create table ad_metrics_daily (campaign_id uuid references ad_campaigns(id) on delete cascade, day date, impressions int default 0, clicks int default 0, primary key (campaign_id, day));

-- ---------- News & civic ----------
create table news_sources (id uuid primary key default gen_random_uuid(), name text not null, url text, licensed boolean not null default false);
create table articles (
  id uuid primary key default gen_random_uuid(), title text not null, title_hi text, summary text not null, body text not null, category text not null,
  source_id uuid references news_sources(id), source_url text, locality_id text references localities(id), breaking boolean not null default false,
  status text not null default 'draft' check (status in ('draft','scheduled','published','unpublished')), scheduled_at timestamptz, published_at timestamptz,
  author_id uuid references profiles(id), is_sample boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz
);
create index on articles (status, published_at desc);
create table civic_alerts (
  id uuid primary key default gen_random_uuid(), title text not null, description text, type text not null, severity text not null, locality_id text references localities(id),
  starts_at timestamptz not null, expires_at timestamptz not null, source text not null, status text not null default 'active', is_simulated boolean not null default false
);

-- ---------- Community & polls ----------
create table posts (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null, kind text not null, locality_id text references localities(id),
  text text not null check (char_length(text) between 10 and 2000), photo_path text, status text not null default 'published', created_at timestamptz not null default now()
);
create table comments (
  id uuid primary key default gen_random_uuid(), target_type text not null, target_id uuid not null, parent_id uuid references comments(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null, text text not null check (char_length(text) between 2 and 1000), hidden boolean not null default false, created_at timestamptz not null default now()
);
create index on comments (target_type, target_id, created_at);
create table reactions (target_type text, target_id uuid, user_id uuid references profiles(id) on delete cascade, kind text not null, created_at timestamptz default now(), primary key (target_type, target_id, user_id, kind));

create table polls (
  id uuid primary key default gen_random_uuid(), question text not null, description text, category text, locality_id text references localities(id),
  opens_at timestamptz not null, closes_at timestamptz not null check (closes_at > opens_at), reveal_at timestamptz not null check (reveal_at >= opens_at),
  visibility text not null default 'anonymous', origin text not null, created_by uuid references profiles(id), status text not null default 'pending', image_path text, created_at timestamptz default now()
);
create table poll_options (id uuid primary key default gen_random_uuid(), poll_id uuid references polls(id) on delete cascade, label text not null, position int not null);
create table votes (
  id uuid primary key default gen_random_uuid(), poll_id uuid references polls(id) on delete cascade, option_id uuid references poll_options(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade, created_at timestamptz not null default now(),
  unique (poll_id, user_id) -- one vote per account, enforced by the database
);
-- Results are only readable after reveal_at, via this function (never select votes directly).
create or replace function poll_results(p_poll uuid) returns table(option_id uuid, votes bigint) language sql stable security definer as $$
  select o.id, count(v.id) from poll_options o left join votes v on v.option_id = o.id
  where o.poll_id = p_poll and exists (select 1 from polls p where p.id = p_poll and p.status = 'approved' and now() >= p.reveal_at)
  group by o.id;
$$;

-- ---------- Services ----------
create table service_providers (
  id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id), name text not null, category text not null, description text,
  locality_id text references localities(id), price_from int, price_unit text, availability text not null default 'available', emergency boolean default false,
  verification verification not null default 'unverified', experience_years int, languages text[], activity_consent boolean not null default false, last_active_at timestamptz,
  seasonal boolean default false, created_at timestamptz default now()
);
create table service_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, category text not null, description text not null,
  locality_id text references localities(id), preferred_date date not null, preferred_time text, urgency text not null default 'normal', photo_paths text[] default '{}',
  status request_status not null default 'open', confirmed_provider_id uuid references service_providers(id), created_at timestamptz not null default now()
);
create table service_responses (
  request_id uuid references service_requests(id) on delete cascade, provider_id uuid references service_providers(id) on delete cascade, message text not null, quote int,
  status text not null default 'pending', created_at timestamptz not null default now(), primary key (request_id, provider_id)
);
create table status_history (id bigserial primary key, entity text not null, entity_id uuid not null, status text not null, note text, actor_id uuid, at timestamptz not null default now());
-- Confirm exactly one provider atomically (prevents conflicting confirmations).
create or replace function confirm_provider(p_request uuid, p_provider uuid) returns void language plpgsql security definer as $$
begin
  update service_requests set status = 'confirmed', confirmed_provider_id = p_provider
   where id = p_request and user_id = auth.uid() and confirmed_provider_id is null and status in ('open','responded');
  if not found then raise exception 'Request cannot be confirmed (already confirmed or closed)'; end if;
  update service_responses set status = case when provider_id = p_provider then 'accepted' else 'declined' end where request_id = p_request and status = 'pending';
end $$;

create table concierge_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, service_type text not null, locality_id text, preferred_date date,
  budget int, notes text, fee_accepted boolean not null, status text not null default 'received', coordinator_id uuid references profiles(id), created_at timestamptz default now()
);
create table labour_posts (
  id uuid primary key default gen_random_uuid(), contractor_id uuid references profiles(id), title text not null, skill text not null, workers int not null, wage int not null,
  wage_unit text not null, locality_id text, duration text, start_date date, status text not null default 'open', created_at timestamptz default now()
);
create table labour_interests (post_id uuid references labour_posts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, availability text, status text default 'interested', created_at timestamptz default now(), primary key (post_id, user_id));

create table reviews (
  id uuid primary key default gen_random_uuid(), target_type text not null, target_id uuid not null, user_id uuid references profiles(id) on delete set null,
  rating smallint not null check (rating between 1 and 5), text text not null check (char_length(text) between 10 and 1500),
  reply_text text, reply_at timestamptz, transaction_id uuid, -- set only when linked to a real completed payment
  hidden boolean not null default false, created_at timestamptz not null default now(), unique (target_type, target_id, user_id)
);

-- ---------- Jobs ----------
create table employers (id uuid primary key default gen_random_uuid(), name text not null, owner_id uuid references profiles(id), verification verification not null default 'unverified');
create table jobs (
  id uuid primary key default gen_random_uuid(), employer_id uuid references employers(id), posted_by uuid references profiles(id), title text not null, category text, type text not null,
  locality_id text, salary_min int not null, salary_max int not null check (salary_max >= salary_min), salary_period text not null, experience text, education text,
  skills text[] default '{}', description text not null, benefits text[] default '{}', deadline date, status text not null default 'pending_review',
  featured boolean default false, urgent boolean default false, created_at timestamptz default now()
);
create index on jobs (status, created_at desc);
create table job_applications (
  id uuid primary key default gen_random_uuid(), job_id uuid references jobs(id) on delete cascade, user_id uuid references profiles(id) on delete cascade,
  cover_note text, resume_path text, consent boolean not null check (consent), status application_status not null default 'submitted', created_at timestamptz default now(),
  unique (job_id, user_id)
);
create table recruitment_requests (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id), company text, role text, category text, experience text, budget int, locality_id text, openings int, fee_accepted boolean not null, status text default 'received', created_at timestamptz default now());

-- ---------- Property & marketplace ----------
create table properties (
  id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id), title text not null, listing_type text not null, category text not null, price int not null,
  locality_id text, area_sqft int, bedrooms int, bathrooms int, furnishing text, amenities text[] default '{}', description text, owner_type text,
  verification verification not null default 'unverified', available boolean default true, student jsonb, photo_paths text[] default '{}', status text not null default 'pending_review', created_at timestamptz default now()
);
create table classifieds (
  id uuid primary key default gen_random_uuid(), seller_id uuid references profiles(id), title text not null, category text not null, condition text not null, price int not null,
  negotiable boolean default true, description text, locality_id text, contact_pref text, vehicle jsonb, photo_paths text[] default '{}',
  status text not null default 'active', expires_at timestamptz not null default now() + interval '30 days', created_at timestamptz default now()
);
create table enquiries (
  id uuid primary key default gen_random_uuid(), target_type text not null, target_id uuid not null, owner_id uuid references profiles(id), from_user_id uuid references profiles(id),
  name text not null, mobile text, message text not null, preferred_time text, consent boolean not null check (consent), status text not null default 'new', created_at timestamptz default now()
);
create table enquiry_replies (id bigserial primary key, enquiry_id uuid references enquiries(id) on delete cascade, author_id uuid references profiles(id), text text not null, created_at timestamptz default now());

-- ---------- Events, bookings, education, health, gov, agri, finance ----------
create table events (id uuid primary key default gen_random_uuid(), title text not null, description text, category text, starts_at timestamptz not null, ends_at timestamptz not null, venue text, locality_id text, organizer_id uuid references profiles(id), organizer text, registration_url text, status text default 'pending_review');
create table ticket_types (id uuid primary key default gen_random_uuid(), event_id uuid references events(id) on delete cascade, name text not null, price int not null, capacity int not null, sold int not null default 0 check (sold <= capacity));
create table bookings (id uuid primary key default gen_random_uuid(), kind text not null, ref_id uuid, user_id uuid references profiles(id), reference text unique not null, lines jsonb not null, total int not null, attendees text[], status text not null, payment_id uuid, created_at timestamptz default now());
create table institutions (id uuid primary key default gen_random_uuid(), name text not null, category text, locality_id text, courses text[], phone text, website text, admission text, verification verification default 'unverified', description text);
create table healthcare_providers (id uuid primary key default gen_random_uuid(), name text not null, type text, specialty text, address text, locality_id text, phone text, hours text, hours_verified boolean default false, services text[], verification verification default 'unverified', source text);
create table health_assist_requests (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id), service_type text not null, locality_id text, urgency text, contact_pref text, status text default 'received', created_at timestamptz default now()); -- no medical details stored
create table schemes (id uuid primary key default gen_random_uuid(), name text not null, level text not null, category text, department text, description text, beneficiaries text, eligibility text[], benefits text[], documents text[], steps text[], official_url text not null, source text not null, last_verified date, rule jsonb);
create table agri_price_records (id bigserial primary key, commodity text not null, market text not null, min_price int, max_price int, modal_price int, unit text not null, price_date date not null, source text not null, unique (commodity, market, price_date));
create table professionals (id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id), name text not null, profession text, qualifications text, qualifications_verified boolean default false, services text[], experience text, locality_id text, verification verification default 'unverified');
create table finance_leads (id uuid primary key default gen_random_uuid(), product_id text, provider_name text not null, user_id uuid references profiles(id), consent boolean not null check (consent), purpose text not null, status text default 'new', created_at timestamptz default now());
create table matrimonial_profiles (id uuid primary key default gen_random_uuid(), user_id uuid unique references profiles(id) on delete cascade, display_name text, age int check (age >= 18), education text, profession text, general_location text, about text, preferences text, photo_visibility text default 'hidden', contact_visibility text default 'hidden', status text default 'active');
create table matrimonial_interests (from_id uuid references matrimonial_profiles(id) on delete cascade, to_id uuid references matrimonial_profiles(id) on delete cascade, status text default 'sent', created_at timestamptz default now(), primary key (from_id, to_id));
create table b2b_requirements (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id), company text, kind text, product text, quantity text, locality_id text, details text, status text default 'open', created_at timestamptz default now());

-- ---------- Engagement, notifications, AI ----------
create table notifications (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, type text not null, title text not null, body text, link text, read boolean not null default false, created_at timestamptz default now());
create index on notifications (user_id, read, created_at desc);
create table push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, endpoint text unique not null, keys jsonb not null, created_at timestamptz default now());
create table points_ledger (id bigserial primary key, user_id uuid references profiles(id) on delete cascade, action text not null, points int not null, note text, at timestamptz default now());
create table checkins (user_id uuid references profiles(id) on delete cascade, kind text, ref text, day date not null default current_date, primary key (user_id, kind, ref, day)); -- one per place per day
create table ai_conversations (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, messages jsonb not null, created_at timestamptz default now(), expires_at timestamptz default now() + interval '30 days');

-- ---------- Trust & safety, payments, audit ----------
create table moderation_cases (id uuid primary key default gen_random_uuid(), kind text not null, target_type text not null, target_id text not null, target_title text, reason text not null, details text, reporter_id uuid references profiles(id), status case_status not null default 'open', resolution text, handled_by uuid references profiles(id), created_at timestamptz default now());
create table payments (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id), description text, amount int not null, gst int not null, status text not null, gateway text, gateway_order_id text, gateway_payment_id text, is_demo boolean not null default false, kind text, plan text, created_at timestamptz default now());
create table invoices (id uuid primary key default gen_random_uuid(), payment_id uuid references payments(id), invoice_no text unique not null, pdf_path text, issued_at timestamptz default now());
create table audit_logs (id bigserial primary key, at timestamptz not null default now(), actor_id uuid references profiles(id), action text not null, target text, details jsonb);

-- ---------- Row-level security (starting point) ----------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Public read of published/active content
create policy "read localities" on localities for select using (true);
create policy "read published articles" on articles for select using (status = 'published' or is_admin());
create policy "read active businesses" on businesses for select using (verification <> 'suspended' or is_admin());
create policy "read open jobs" on jobs for select using (status = 'open' or posted_by = auth.uid() or is_admin());
create policy "read approved polls" on polls for select using (status = 'approved' or created_by = auth.uid() or is_admin());
create policy "read poll options" on poll_options for select using (true);
-- Votes: insert own only; no direct reads (results via poll_results()).
create policy "vote once" on votes for insert with check (user_id = auth.uid());
-- Own data
create policy "own profile" on profiles for all using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());
create policy "own requests" on service_requests for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid());
create policy "own applications" on job_applications for select using (user_id = auth.uid() or exists (select 1 from jobs j where j.id = job_id and j.posted_by = auth.uid()) or is_admin());
create policy "apply as self" on job_applications for insert with check (user_id = auth.uid());
create policy "own notifications" on notifications for all using (user_id = auth.uid());
create policy "enquiry parties" on enquiries for select using (from_user_id = auth.uid() or owner_id = auth.uid() or is_admin());
create policy "send enquiry" on enquiries for insert with check (from_user_id = auth.uid() and consent);
-- Admin-only tables
create policy "admin roles" on user_roles for all using (is_admin()) with check (is_admin());
create policy "admin audit" on audit_logs for select using (is_admin());
create policy "admin cases" on moderation_cases for select using (is_admin() or reporter_id = auth.uid());
create policy "file report" on moderation_cases for insert with check (reporter_id = auth.uid());
-- Add equivalent policies for every remaining table before launch.
