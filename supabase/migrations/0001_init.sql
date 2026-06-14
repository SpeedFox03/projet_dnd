-- =============================================================================
-- Projet DND — Schéma initial
-- Base de connaissances MJ : contenu source immuable + overrides/variantes user
-- =============================================================================
-- Principe central :
--   * Une seule table `entities` porte TOUTES les fiches (source ET utilisateur).
--   * `kind` distingue source / custom / variant / override.
--   * `data` JSONB est validé applicativement par le schéma de la catégorie.
--   * RLS isole strictement le contenu utilisateur ; le contenu source
--     (owner_id IS NULL) n'est jamais modifiable par un utilisateur.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- recherche trigram (fuzzy)

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type entity_kind as enum ('source', 'custom', 'variant', 'override');
create type visibility  as enum ('official', 'public', 'private');

-- ---------------------------------------------------------------------------
-- Fonction de vecteur de recherche.
-- Encapsulée et marquée IMMUTABLE : une colonne `generated stored` refuse
-- l'expression brute car la coercition `'simple'::regconfig` est jugée STABLE.
-- En isolant la logique dans une fonction immuable, Postgres l'accepte.
-- ---------------------------------------------------------------------------
create or replace function entity_search_vector(
  p_name text, p_summary text, p_tags text[], p_data jsonb
) returns tsvector
language sql
immutable
as $$
  select setweight(to_tsvector('simple', coalesce(p_name, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(p_summary, '')), 'B')
      || setweight(to_tsvector('simple', coalesce(array_to_string(p_tags, ' '), '')), 'C')
      || setweight(to_tsvector('simple', coalesce(p_data::text, '')), 'D');
$$;

-- ---------------------------------------------------------------------------
-- PROFILES (1-1 avec auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- Le `schema` JSONB décrit les champs (voir src/types/domain.ts: CategorySchema).
-- owner_id NULL = catégorie globale/système ; sinon catégorie perso.
-- ---------------------------------------------------------------------------
create table categories (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  name             text not null,
  description      text,
  icon             text,                                   -- nom d'icône (lucide)
  schema           jsonb not null default '{"fields":[]}'::jsonb,
  display_template jsonb,                                  -- layout d'affichage optionnel
  default_tags     text[] not null default '{}',
  is_system        boolean not null default false,
  owner_id         uuid references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Slug unique au niveau global (owner NULL) et au niveau de chaque user.
create unique index categories_slug_global_idx
  on categories (slug) where owner_id is null;
create unique index categories_slug_owner_idx
  on categories (owner_id, slug) where owner_id is not null;

-- ---------------------------------------------------------------------------
-- ENTITIES (table centrale)
-- ---------------------------------------------------------------------------
create table entities (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid not null references categories(id) on delete restrict,
  owner_id           uuid references auth.users(id) on delete cascade, -- NULL = source officielle
  kind               entity_kind not null default 'custom',
  visibility         visibility  not null default 'private',
  parent_id          uuid references entities(id) on delete set null,  -- source d'un override/variant
  name               text not null,
  summary            text,
  data               jsonb not null default '{}'::jsonb,
  patch              jsonb,                                -- diff vs parent (overrides) pour DiffView
  tags               text[] not null default '{}',
  license            text,                                 -- ex: 'SRD-5.1', 'CC-BY', 'user-owned'
  source_name        text,                                 -- provenance lisible
  rev                integer not null default 1,           -- concurrence optimiste (sync)
  is_default_variant boolean not null default false,
  deleted_at         timestamptz,                          -- soft delete (utile offline)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Vecteur de recherche full-text pondéré (nom > résumé > tags > data).
  search_vector tsvector generated always as (
    entity_search_vector(name, summary, tags, data)
  ) stored,

  -- Garde-fous d'intégrité
  constraint source_has_no_owner check (kind <> 'source' or owner_id is null),
  constraint derived_has_parent  check (kind not in ('variant','override') or parent_id is not null)
);

create index entities_category_idx   on entities (category_id);
create index entities_owner_idx       on entities (owner_id);
create index entities_parent_idx      on entities (parent_id);
create index entities_kind_idx        on entities (kind);
create index entities_updated_idx     on entities (updated_at);     -- delta sync
create index entities_search_idx      on entities using gin (search_vector);
create index entities_tags_idx        on entities using gin (tags);
create index entities_data_idx        on entities using gin (data jsonb_path_ops);
create index entities_name_trgm_idx   on entities using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ENTITY_VERSIONS (historique immuable — snapshot à chaque save)
-- ---------------------------------------------------------------------------
create table entity_versions (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references entities(id) on delete cascade,
  rev         integer not null,
  name        text not null,
  data        jsonb not null,
  edited_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (entity_id, rev)
);
create index entity_versions_entity_idx on entity_versions (entity_id);

-- ---------------------------------------------------------------------------
-- CAMPAIGNS
-- ---------------------------------------------------------------------------
create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  offline     boolean not null default true,    -- préchargé hors ligne ?
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index campaigns_owner_idx on campaigns (owner_id);

create table campaign_entities (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  entity_id   uuid not null references entities(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (campaign_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- FAVORITES
-- ---------------------------------------------------------------------------
create table favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  entity_id  uuid not null references entities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- TRIGGERS : maj updated_at
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated   before update on profiles   for each row execute function set_updated_at();
create trigger trg_categories_updated before update on categories for each row execute function set_updated_at();
create trigger trg_entities_updated   before update on entities   for each row execute function set_updated_at();
create trigger trg_campaigns_updated  before update on campaigns  for each row execute function set_updated_at();

-- Création auto du profil à l'inscription
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table profiles          enable row level security;
alter table categories        enable row level security;
alter table entities          enable row level security;
alter table entity_versions   enable row level security;
alter table campaigns         enable row level security;
alter table campaign_entities enable row level security;
alter table favorites         enable row level security;

-- PROFILES ---------------------------------------------------------------
create policy profiles_select on profiles for select using (id = auth.uid());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- CATEGORIES : lecture des globales + des siennes ; écriture des siennes -
create policy categories_select on categories for select
  using (owner_id is null or owner_id = auth.uid());
create policy categories_insert on categories for insert
  with check (owner_id = auth.uid());
create policy categories_update on categories for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy categories_delete on categories for delete
  using (owner_id = auth.uid());

-- ENTITIES ---------------------------------------------------------------
-- Lecture : officielles + publiques + les siennes.
create policy entities_select on entities for select
  using (visibility in ('official','public') or owner_id = auth.uid());
-- Écriture : uniquement ses propres entités, jamais une 'source'.
-- (le contenu source est inséré via seed / service_role qui bypass RLS)
create policy entities_insert on entities for insert
  with check (owner_id = auth.uid() and kind <> 'source');
create policy entities_update on entities for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy entities_delete on entities for delete
  using (owner_id = auth.uid());

-- ENTITY_VERSIONS --------------------------------------------------------
create policy versions_select on entity_versions for select using (
  exists (select 1 from entities e
          where e.id = entity_id
            and (e.visibility in ('official','public') or e.owner_id = auth.uid()))
);
create policy versions_insert on entity_versions for insert with check (
  exists (select 1 from entities e where e.id = entity_id and e.owner_id = auth.uid())
);

-- CAMPAIGNS --------------------------------------------------------------
create policy campaigns_all on campaigns for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy campaign_entities_all on campaign_entities for all using (
  exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
);

-- FAVORITES --------------------------------------------------------------
create policy favorites_all on favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
