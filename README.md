# Projet DND — Bible du MJ (PWA offline-first)

Base de connaissances personnalisable pour maître du jeu : recherche globale,
fiches modifiables, variantes/overrides, contenu perso, sync cloud, multi-fiches.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind/shadcn**
- **Supabase** (Postgres + Auth + RLS + Storage)
- **Dexie/IndexedDB** + couche de sync maison (outbox) — offline-first
- **TanStack Query** (cache), **Zustand** (onglets/split), **RHF + Zod** (formulaires)
- **MiniSearch** (recherche locale), **Serwist** (PWA)

## Concept de données (le point clé)

Une seule table `entities` porte toutes les fiches. `kind` distingue :

| kind       | description                                  | propriétaire |
|------------|----------------------------------------------|--------------|
| `source`   | contenu officiel/SRD, **immuable**           | NULL         |
| `custom`   | fiche créée from scratch                      | user         |
| `variant`  | dérivé nommé d'une source (ex: Gobelin chef)  | user         |
| `override` | copie perso d'une source (remplace l'affichage) | user      |

> Contenu source jamais écrasé : les modifs user vivent dans des lignes séparées,
> isolées par **RLS**. « Restaurer l'original » = supprimer l'override.

## Architecture offline (résumé)

```
UI → EntityRepository → Dexie (lecture/écriture immédiate) + Outbox
                              ↑
                         SyncEngine (en arrière-plan, online)
                              ↓
                          Supabase (RLS, RPC upsert_entity)
```

- **Sources** : pull-only par delta (`updated_at`).
- **Contenu user** : outbox → `rpc upsert_entity` (concurrence optimiste sur `rev`).
- **Conflits** : si `rev` serveur ≠ `baseRev`, l'entité passe en `conflict`.

## Arborescence

```
supabase/migrations/   # 0001_init.sql (schéma+RLS), 0002_upsert_rpc.sql
supabase/seed.sql      # catégories système + exemples SRD
src/types/             # domain.ts (types partagés)
src/lib/db/            # local-db.ts (Dexie)
src/lib/sync/          # sync-engine.ts, mappers.ts
src/lib/repository/    # entity-repository.ts (API offline-first de l'UI)
src/lib/supabase/      # client.ts
src/components/        # ui, layout, search, entity, category (à venir)
src/stores/            # zustand (à venir)
src/app/               # routes Next (à venir)
```

## Démarrage

```bash
pnpm install
cp .env.example .env.local      # renseigner les clés Supabase
supabase db reset               # applique migrations + seed (local)
pnpm dev
```

## Avertissement légal sur le contenu

Ne jamais importer/seeder de contenu propriétaire. Uniquement **SRD/OGL**,
**Creative Commons**, contenu **original**, ou contenu **possédé par l'utilisateur**.
Chaque source porte un champ `license`.

## Feuille de route (MVP)

- [x] Schéma DB + RLS + RPC + seed
- [x] Couche locale (Dexie) + SyncEngine + Repository + types
- [x] Sprint 1 : Auth, pull sources, Sidebar, EntityView (FieldRenderer), recherche locale, onglets + split, PWA
- [x] Sprint 2 : EntityEditor (RHF+Zod), push outbox, variantes/override/fork UI, favoris/tags
- [x] Sprint 3 : DiffView, résolution de conflits, VariantSwitcher (+ résolution override), SchemaEditor (catégories perso)
- [x] Sprint 4 : campagnes (CRUD + appartenance), liens inter-fiches `[[...]]` + backlinks, toggle offline par campagne
- [ ] Sprint 5 : sync partielle réelle selon sélection offline, recherche sémantique (pgvector + embeddings)
