-- CareLens (fivew-oneh) — database schema
-- Target: PostgreSQL 15+ / Supabase. Mirrors src/data/types.ts.
-- Uses Supabase's auth schema (auth.users, auth.uid()). For plain Postgres,
-- apply db/local/000_auth_stub.sql first.

-- gen_random_uuid() is built into PostgreSQL 13+; no extension required.

-- ---------- Enums ----------
create type review_status as enum ('draft', 'needs_verification', 'reviewed', 'published', 'archived');
create type evidence_level as enum ('established', 'moderate', 'preliminary', 'traditional', 'insufficient', 'unsupported');
create type source_kind as enum ('regulator', 'guideline', 'professional_body', 'database', 'government', 'review', 'editorial');
create type topic_kind as enum ('practice', 'ayurvedic', 'home_remedy', 'lifestyle', 'concern');
create type climate_zone as enum ('hot_humid', 'hot_dry', 'moderate', 'cold', 'monsoon');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Reference data ----------
create table sources (
  id text primary key,
  title text not null,
  publisher text not null,
  url text check (url is null or url ~ '^https://'),
  kind source_kind not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id text primary key,
  name text not null,
  short_name text not null,
  description text not null,
  icon text not null,
  sort_order int not null default 0
);

create table subcategories (
  category_id text not null references categories(id) on delete cascade,
  id text not null,
  name text not null,
  description text not null,
  sort_order int not null default 0,
  primary key (category_id, id)
);

create table brands (
  id text primary key,
  name text not null unique,
  is_demo boolean not null default false,
  official_url text
);

create table regions (
  id text primary key,
  name text not null,
  state text not null,
  climate climate_zone not null,
  lat numeric(6, 3) not null,
  lon numeric(6, 3) not null,
  note text not null
);

create table search_synonyms (
  id bigint generated always as identity primary key,
  pattern text not null,       -- term as typed (lower case)
  replacement text not null,   -- canonical term(s)
  unique (pattern, replacement)
);

-- ---------- Ingredients ----------
create table ingredients (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  inci text,
  kind text not null,
  tier text not null check (tier in ('full', 'glossary')),
  summary text not null,
  functions text[] not null default '{}',
  product_types text[] not null default '{}',
  evidence_level evidence_level not null,
  evidence_summary text not null,
  concentrations text,
  traditional_use text,
  flags text[] not null default '{}',
  details jsonb not null default '{}',     -- benefits, limitations, adverse effects, precautions, forms, faqs…
  five_w jsonb,                            -- { what, why, when, who, where, how }
  suitability jsonb not null default '{}',
  status review_status not null default 'draft',
  last_reviewed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredients_published_reviewed check (status not in ('published', 'reviewed') or last_reviewed is not null)
);
create index ingredients_status_idx on ingredients (status);
create index ingredients_name_idx on ingredients (lower(name));

create table ingredient_synonyms (
  ingredient_id text not null references ingredients(id) on delete cascade,
  synonym text not null,
  primary key (ingredient_id, synonym)
);
create index ingredient_synonyms_lower_idx on ingredient_synonyms (lower(synonym));

create table ingredient_categories (
  ingredient_id text not null references ingredients(id) on delete cascade,
  category_id text not null references categories(id) on delete cascade,
  primary key (ingredient_id, category_id)
);

create table ingredient_sources (
  ingredient_id text not null references ingredients(id) on delete cascade,
  source_id text not null references sources(id),
  primary key (ingredient_id, source_id)
);

create table ingredient_alternatives (
  ingredient_id text not null references ingredients(id) on delete cascade,
  alternative_id text not null references ingredients(id) on delete cascade,
  primary key (ingredient_id, alternative_id),
  check (ingredient_id <> alternative_id)
);

-- ---------- Products ----------
create table products (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  brand_id text not null references brands(id),
  name text not null,
  category_id text not null references categories(id),
  subcategory_id text not null,
  product_type text not null,
  intended_use text not null,
  description text not null,
  net_quantity_value numeric(10, 2) not null check (net_quantity_value > 0),
  net_quantity_unit text not null check (net_quantity_unit in ('ml', 'g')),
  price_amount numeric(10, 2) check (price_amount is null or price_amount >= 0),
  price_currency char(3) not null default 'INR',
  price_verified boolean not null default false,
  directions text,
  details jsonb not null default '{}',   -- benefits, limitations, warnings
  suitability jsonb not null default '{}',
  official_url text,
  is_demo boolean not null default false,
  ingredient_list_verified boolean not null default false,
  verification text not null default 'unverified' check (verification in ('unverified', 'partially_verified', 'verified')),
  status review_status not null default 'draft',
  last_verified date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, subcategory_id) references subcategories(category_id, id)
);
create index products_category_idx on products (category_id, subcategory_id);
create index products_status_idx on products (status);

-- Price per standard unit, calculated rather than stored.
create view product_unit_prices as
  select id, price_amount / net_quantity_value as price_per_unit, net_quantity_unit as unit,
         price_amount / net_quantity_value * 100 as price_per_100
  from products where price_amount is not null;

create table product_ingredients (
  product_id text not null references products(id) on delete cascade,
  position int not null check (position > 0),
  label text not null,                                  -- as printed on the label
  ingredient_id text references ingredients(id),        -- null when not recognised
  concentration text,                                   -- only when declared
  primary key (product_id, position)
);
create index product_ingredients_ingredient_idx on product_ingredients (ingredient_id);

create table product_sources (
  product_id text not null references products(id) on delete cascade,
  source_id text not null references sources(id),
  primary key (product_id, source_id)
);

-- ---------- Care topics ----------
create table care_topics (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  kind topic_kind not null,
  subcategory_id text,
  summary text not null,
  synonyms text[] not null default '{}',
  traditional_purpose text,
  recommendation text check (recommendation in ('reasonable', 'use_with_caution', 'not_recommended')),
  claims jsonb not null default '[]',    -- [{ claim, level, note }]
  details jsonb not null default '{}',   -- risks, hygiene, precautions, seeProfessional, faqs
  five_w jsonb not null,
  suitability jsonb not null default '{}',
  status review_status not null default 'draft',
  last_reviewed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_published_reviewed check (status not in ('published', 'reviewed') or last_reviewed is not null)
);
create index care_topics_status_idx on care_topics (status);

create table topic_categories (
  topic_id text not null references care_topics(id) on delete cascade,
  category_id text not null references categories(id) on delete cascade,
  primary key (topic_id, category_id)
);

create table topic_relationships (
  topic_id text not null references care_topics(id) on delete cascade,
  related_type text not null check (related_type in ('ingredient', 'topic')),
  related_id text not null,
  primary key (topic_id, related_type, related_id)
);

create table topic_sources (
  topic_id text not null references care_topics(id) on delete cascade,
  source_id text not null references sources(id),
  primary key (topic_id, source_id)
);

-- ---------- Articles ----------
create table articles (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null,
  type text not null,
  summary text not null,
  takeaways text[] not null default '{}',
  sections jsonb not null default '[]',
  keywords text[] not null default '{}',
  read_minutes int not null check (read_minutes > 0),
  author text not null,
  published_on date,
  last_reviewed date,
  status review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_published_reviewed check (status not in ('published', 'reviewed') or last_reviewed is not null)
);
create index articles_status_idx on articles (status);

create table article_categories (
  article_id text not null references articles(id) on delete cascade,
  category_id text not null references categories(id) on delete cascade,
  primary key (article_id, category_id)
);

create table article_relations (
  article_id text not null references articles(id) on delete cascade,
  related_type text not null check (related_type in ('ingredient', 'topic', 'product')),
  related_id text not null,
  primary key (article_id, related_type, related_id)
);

create table article_sources (
  article_id text not null references articles(id) on delete cascade,
  source_id text not null references sources(id),
  primary key (article_id, source_id)
);

-- ---------- Review history ----------
create table content_reviews (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('ingredient', 'product', 'topic', 'article')),
  entity_id text not null,
  from_status review_status,
  to_status review_status not null,
  reviewer_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index content_reviews_entity_idx on content_reviews (entity_type, entity_id, created_at desc);

-- Publishing requires at least one source. Implemented as a deferred
-- constraint trigger so a record and its sources can be inserted in one transaction.
create or replace function require_sources() returns trigger language plpgsql as $$
declare
  n int;
begin
  if new.status <> 'published' then
    return null;
  end if;
  execute format('select count(*) from %I where %I = $1', tg_argv[0], tg_argv[1]) into n using new.id;
  if n = 0 then
    raise exception '% "%" cannot be published without sources', tg_table_name, new.id;
  end if;
  return null;
end $$;

create constraint trigger ingredients_need_sources after insert or update on ingredients
  deferrable initially deferred for each row execute function require_sources('ingredient_sources', 'ingredient_id');
create constraint trigger topics_need_sources after insert or update on care_topics
  deferrable initially deferred for each row execute function require_sources('topic_sources', 'topic_id');
create constraint trigger articles_need_sources after insert or update on articles
  deferrable initially deferred for each row execute function require_sources('article_sources', 'article_id');
create constraint trigger products_need_sources after insert or update on products
  deferrable initially deferred for each row execute function require_sources('product_sources', 'product_id');

-- Record every status change.
create or replace function log_status_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into content_reviews (entity_type, entity_id, from_status, to_status, reviewer_id)
    values (tg_argv[0], new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger ingredients_status_log after insert or update on ingredients for each row execute function log_status_change('ingredient');
create trigger products_status_log after insert or update on products for each row execute function log_status_change('product');
create trigger topics_status_log after insert or update on care_topics for each row execute function log_status_change('topic');
create trigger articles_status_log after insert or update on articles for each row execute function log_status_change('article');

create trigger ingredients_updated before update on ingredients for each row execute function set_updated_at();
create trigger products_updated before update on products for each row execute function set_updated_at();
create trigger topics_updated before update on care_topics for each row execute function set_updated_at();
create trigger articles_updated before update on articles for each row execute function set_updated_at();
create trigger sources_updated before update on sources for each row execute function set_updated_at();

-- ---------- Users (optional accounts) ----------
create table editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'reviewer', 'admin'))
);

create or replace function is_editor() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid());
$$;

create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table saved_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('product', 'ingredient', 'article', 'topic')),
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

create table comparison_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('products', 'ingredients')),
  item_ids text[] not null check (cardinality(item_ids) between 2 and 4),
  label text not null,
  created_at timestamptz not null default now()
);
create index comparison_lists_user_idx on comparison_lists (user_id);

create table owned_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  time_of_day text not null check (time_of_day in ('morning', 'evening', 'weekly', 'other')),
  reminder time,
  steps jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index routines_user_idx on routines (user_id);

-- ---------- Row-level security ----------
-- Content: anyone can read public statuses; only editors can read drafts/archived or write.
do $$
declare
  t text;
begin
  foreach t in array array['ingredients', 'products', 'care_topics', 'articles'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (status in ('published', 'reviewed', 'needs_verification') or is_editor())$p$, t || '_read', t);
    execute format('create policy %I on %I for all using (is_editor()) with check (is_editor())', t || '_write', t);
  end loop;
  foreach t in array array['sources', 'categories', 'subcategories', 'brands', 'regions', 'search_synonyms',
                           'ingredient_synonyms', 'ingredient_categories', 'ingredient_sources', 'ingredient_alternatives',
                           'product_ingredients', 'product_sources', 'topic_categories', 'topic_relationships', 'topic_sources',
                           'article_categories', 'article_relations', 'article_sources'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('create policy %I on %I for all using (is_editor()) with check (is_editor())', t || '_write', t);
  end loop;
  -- Private user data: owners only.
  foreach t in array array['user_profiles', 'saved_items', 'comparison_lists', 'owned_products', 'routines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner', t);
  end loop;
end $$;

alter table content_reviews enable row level security;
create policy content_reviews_editors on content_reviews for all using (is_editor()) with check (is_editor());
alter table editors enable row level security;
create policy editors_self on editors for select using (user_id = auth.uid());
