// Applies the migration and seed to a fresh in-memory Postgres (PGlite) and
// checks counts, constraints and row-level security. Usage: npm run db:test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTICLES } from '../src/data/articles';
import { INGREDIENTS } from '../src/data/ingredients';
import { PRODUCTS } from '../src/data/products';
import { TOPICS } from '../src/data/topics';
import { generateSeedSql } from './generate-seed-sql';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

function check(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`✓ ${msg}`);
}

const db = new PGlite();
await db.exec(read('db/local/000_auth_stub.sql'));
await db.exec(read('db/migrations/001_schema.sql'));
check(true, 'migration applied to a fresh database');
await db.exec(generateSeedSql());
check(true, 'seed applied');

const count = async (sql: string) => Number(((await db.query<{ n: number }>(sql)).rows[0] as { n: number }).n);
check((await count('select count(*) n from ingredients')) === INGREDIENTS.length, `ingredients = ${INGREDIENTS.length}`);
check((await count('select count(*) n from products')) === PRODUCTS.length, `products = ${PRODUCTS.length}`);
check((await count('select count(*) n from care_topics')) === TOPICS.length, `topics = ${TOPICS.length}`);
check((await count('select count(*) n from articles')) === ARTICLES.length, `articles = ${ARTICLES.length}`);
check((await count("select count(*) n from product_ingredients where ingredient_id = 'niacinamide'")) >= 3, 'product–ingredient relationships');
check((await count("select count(*) n from ingredient_synonyms where lower(synonym) = 'haldi'")) === 1, 'synonym index lookup');
check((await count("select count(*) n from product_unit_prices where id = 'demo-niacinamide-10-zinc' and price_per_unit = 25")) === 1, 'price-per-unit view');
check((await count('select count(*) n from content_reviews')) > 0, 'status changes logged to content_reviews');

let rejected = false;
try {
  await db.exec("begin; insert into articles (id, title, type, summary, read_minutes, author, status, last_reviewed) values ('no-sources', 't', 'faq', 's', 1, 'a', 'published', '2026-01-01'); commit;");
} catch {
  rejected = true;
  await db.exec('rollback');
}
check(rejected, 'publishing without sources is rejected');

rejected = false;
try {
  await db.exec("insert into articles (id, title, type, summary, read_minutes, author, status) values ('no-date', 't', 'faq', 's', 1, 'a', 'reviewed')");
} catch {
  rejected = true;
}
check(rejected, 'reviewed content requires a last-reviewed date');

// RLS: run as a non-superuser role.
const userA = '11111111-1111-1111-1111-111111111111';
const userB = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${userA}'), ('${userB}');
  create role app_user nologin;
  grant usage on schema public, auth to app_user;
  grant select, insert, update, delete on all tables in schema public to app_user;
  grant select on all tables in schema auth to app_user;
  grant execute on all functions in schema auth to app_user;`);
await db.exec(`set role app_user; set request.jwt.claim.sub = '${userA}';`);
const visibleArticles = await count('select count(*) n from articles');
check(visibleArticles === ARTICLES.filter((a) => ['published', 'reviewed', 'needs_verification'].includes(a.status)).length, 'RLS hides draft/archived content from the public');
await db.exec(`insert into saved_items (user_id, item_type, item_id) values ('${userA}', 'ingredient', 'niacinamide')`);
await db.exec(`set request.jwt.claim.sub = '${userB}'`);
check((await count('select count(*) n from saved_items')) === 0, "RLS: users cannot read others' saved items");
rejected = false;
try {
  await db.exec(`insert into saved_items (user_id, item_type, item_id) values ('${userA}', 'product', 'x')`);
} catch {
  rejected = true;
}
check(rejected, "RLS: users cannot write others' data");
rejected = false;
try {
  await db.exec("update ingredients set name = 'x' where id = 'niacinamide'");
  rejected = (await count("select count(*) n from ingredients where name = 'x'")) === 0;
} catch {
  rejected = true;
}
check(rejected, 'RLS: non-editors cannot edit content');
await db.exec('reset role');
console.log('All database checks passed');
await db.close();
