-- =============================================================================
-- Seed : catégories système + quelques entités SOURCE (contenu libre/SRD only)
-- IMPORTANT : ne JAMAIS seeder de contenu propriétaire. Uniquement SRD 5.1 (OGL),
-- Creative Commons, ou contenu original.
-- Exécuté via service_role (bypass RLS) → owner_id NULL = contenu global.
-- =============================================================================

-- ---- CATEGORIES -------------------------------------------------------------
insert into categories (id, slug, name, icon, is_system, default_tags, schema) values
(
  '00000000-0000-0000-0000-000000000001', 'monster', 'Monstre', 'skull', true, '{}',
  '{
    "groups": [
      {"key": "identity", "label": "Identité"},
      {"key": "combat",   "label": "Combat"},
      {"key": "actions",  "label": "Actions"},
      {"key": "lore",     "label": "Lore & MJ"}
    ],
    "fields": [
      {"key": "type",        "label": "Type",        "type": "text",   "group": "identity"},
      {"key": "size",        "label": "Taille",      "type": "select", "group": "identity", "options": ["TP","P","M","G","TG","Gig"]},
      {"key": "alignment",   "label": "Alignement",  "type": "text",   "group": "identity"},
      {"key": "ac",          "label": "CA",          "type": "number", "group": "combat", "required": true},
      {"key": "hp",          "label": "PV",          "type": "number", "group": "combat", "required": true},
      {"key": "speed",       "label": "Vitesse",     "type": "text",   "group": "combat"},
      {"key": "abilities",   "label": "Caractéristiques", "type": "object", "group": "combat"},
      {"key": "saves",       "label": "Jets de sauvegarde", "type": "text", "group": "combat"},
      {"key": "skills",      "label": "Compétences", "type": "text",   "group": "combat"},
      {"key": "resistances", "label": "Résistances", "type": "tags",   "group": "combat"},
      {"key": "immunities",  "label": "Immunités",   "type": "tags",   "group": "combat"},
      {"key": "senses",      "label": "Sens",        "type": "text",   "group": "combat"},
      {"key": "languages",   "label": "Langues",     "type": "text",   "group": "combat"},
      {"key": "cr",          "label": "FP / Niveau", "type": "text",   "group": "combat"},
      {"key": "actions",     "label": "Actions",        "type": "list", "group": "actions"},
      {"key": "reactions",   "label": "Réactions",      "type": "list", "group": "actions"},
      {"key": "legendary",   "label": "Actions légendaires", "type": "list", "group": "actions"},
      {"key": "description", "label": "Description", "type": "rich",   "group": "lore"},
      {"key": "tactics",     "label": "Tactique",    "type": "rich",   "group": "lore"},
      {"key": "loot",        "label": "Butin",       "type": "rich",   "group": "lore"},
      {"key": "notes",       "label": "Notes perso", "type": "rich",   "group": "lore"}
    ]
  }'::jsonb
),
(
  '00000000-0000-0000-0000-000000000002', 'spell', 'Sort', 'sparkles', true, '{}',
  '{
    "fields": [
      {"key": "level",      "label": "Niveau",       "type": "number", "required": true},
      {"key": "school",     "label": "École",        "type": "text"},
      {"key": "casting",    "label": "Temps d''incantation", "type": "text"},
      {"key": "range",      "label": "Portée",       "type": "text"},
      {"key": "components", "label": "Composantes",   "type": "text"},
      {"key": "duration",   "label": "Durée",         "type": "text"},
      {"key": "classes",    "label": "Classes",       "type": "tags"},
      {"key": "description","label": "Description",    "type": "rich", "required": true},
      {"key": "higher",     "label": "Aux niveaux supérieurs", "type": "rich"},
      {"key": "notes",      "label": "Notes perso",   "type": "rich"}
    ]
  }'::jsonb
),
(
  '00000000-0000-0000-0000-000000000003', 'weapon', 'Arme', 'sword', true, '{}',
  '{
    "fields": [
      {"key": "type",        "label": "Type",      "type": "text"},
      {"key": "rarity",      "label": "Rareté",    "type": "select", "options": ["Commun","Peu commun","Rare","Très rare","Légendaire","Artéfact"]},
      {"key": "damage",      "label": "Dégâts",    "type": "text"},
      {"key": "properties",  "label": "Propriétés","type": "tags"},
      {"key": "bonus",       "label": "Bonus",     "type": "text"},
      {"key": "effect",      "label": "Effet",     "type": "rich"},
      {"key": "requirements","label": "Prérequis", "type": "text"},
      {"key": "level",       "label": "Niveau recommandé", "type": "number"},
      {"key": "price",       "label": "Prix",      "type": "text"},
      {"key": "weight",      "label": "Poids",     "type": "text"},
      {"key": "description", "label": "Description","type": "rich"}
    ]
  }'::jsonb
);

-- ---- ENTITIES ---------------------------------------------------------------
-- Le contenu source (monstres, sorts, objets, etc.) est importé via le script
-- `node scripts/import-srd.mjs` (SRD 5.1, CC-BY-4.0). On ne seede plus d'entités
-- à la main ici pour éviter les doublons.
-- (bloc d'exemple retiré)
/*
insert into entities (category_id, owner_id, kind, visibility, name, summary, tags, license, source_name, data) values
(
  '00000000-0000-0000-0000-000000000001', null, 'source', 'official',
  'Gobelin', 'Petit humanoïde fourbe vivant en bande.', '{gobelinoïde,humanoïde,faible}',
  'SRD-5.1', 'SRD 5.1',
  '{
    "type": "humanoïde (gobelinoïde)",
    "size": "P",
    "alignment": "Neutre Mauvais",
    "ac": 15, "hp": 7, "speed": "9 m",
    "abilities": {"for": 8, "dex": 14, "con": 10, "int": 10, "sag": 8, "cha": 8},
    "skills": "Discrétion +6",
    "senses": "vision dans le noir 18 m, Perception passive 9",
    "languages": "commun, gobelin",
    "cr": "1/4",
    "actions": ["Cimeterre : +4, 1d6+2 tranchant", "Arc court : +4, 1d6+2 perforant (portée 24/96 m)"],
    "description": "Les gobelins sont de petits humanoïdes lâches mais nombreux.",
    "tactics": "Frappe en surnombre, utilise Désengagement/Cachette comme action bonus (Évasion fugace)."
  }'::jsonb
);
*/
