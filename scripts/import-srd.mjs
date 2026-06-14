/**
 * Import du contenu SRD 5.1 (licence CC-BY-4.0) dans Supabase, en tant que
 * contenu `source` officiel et immuable (owner_id NULL, visibility 'official').
 *
 * Source : https://github.com/5e-bits/5e-database (SRD 5.1).
 *   - Français quand disponible (sorts, races, classes, dons, états, historiques, règles)
 *   - Anglais sinon (monstres, équipement, objets magiques)
 *
 * Idempotent : chaque entité a un UUID déterministe (uuid v5) -> ré-exécuter
 * met simplement à jour. S'exécute avec la clé service_role (bypass RLS).
 *
 * Lancement :  node scripts/import-srd.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';

// --- Config / env -----------------------------------------------------------
function loadEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const NS = 'b6c1f3e2-5d4a-4c3b-9e2a-1f2d3c4b5a6e'; // namespace UUID v5
const RAW = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014';
const LICENSE = 'CC-BY-4.0 (SRD 5.1)';
const SOURCE = 'SRD 5.1';

// --- Catégories (UUID fixes) -----------------------------------------------
const CAT = {
  monster: '00000000-0000-0000-0000-000000000001',
  spell: '00000000-0000-0000-0000-000000000002',
  weapon: '00000000-0000-0000-0000-000000000003',
  armor: '00000000-0000-0000-0000-000000000004',
  gear: '00000000-0000-0000-0000-000000000005',
  magicItem: '00000000-0000-0000-0000-000000000006',
  race: '00000000-0000-0000-0000-000000000007',
  klass: '00000000-0000-0000-0000-000000000008',
  feat: '00000000-0000-0000-0000-000000000009',
  condition: '00000000-0000-0000-0000-00000000000a',
  background: '00000000-0000-0000-0000-00000000000b',
  rule: '00000000-0000-0000-0000-00000000000c',
  feature: '00000000-0000-0000-0000-00000000000d',
  reference: '00000000-0000-0000-0000-00000000000e',
};

const f = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
const descField = f('description', 'Description', 'rich');

const CATEGORIES = [
  {
    id: CAT.monster, slug: 'monster', name: 'Monstre', icon: 'skull',
    schema: {
      groups: [
        { key: 'identity', label: 'Identité' },
        { key: 'combat', label: 'Combat' },
        { key: 'actions', label: 'Actions' },
        { key: 'lore', label: 'Lore & MJ' },
      ],
      fields: [
        f('type', 'Type', 'text', { group: 'identity' }),
        f('size', 'Taille', 'text', { group: 'identity' }),
        f('alignment', 'Alignement', 'text', { group: 'identity' }),
        f('ac', 'CA', 'number', { group: 'combat' }),
        f('hp', 'PV', 'number', { group: 'combat' }),
        f('speed', 'Vitesse', 'text', { group: 'combat' }),
        f('abilities', 'Caractéristiques', 'object', { group: 'combat' }),
        f('saves', 'Jets de sauvegarde', 'text', { group: 'combat' }),
        f('skills', 'Compétences', 'text', { group: 'combat' }),
        f('resistances', 'Résistances', 'tags', { group: 'combat' }),
        f('immunities', 'Immunités', 'tags', { group: 'combat' }),
        f('senses', 'Sens', 'text', { group: 'combat' }),
        f('languages', 'Langues', 'text', { group: 'combat' }),
        f('cr', 'FP', 'text', { group: 'combat' }),
        f('actions', 'Actions', 'list', { group: 'actions' }),
        f('reactions', 'Réactions', 'list', { group: 'actions' }),
        f('legendary', 'Actions légendaires', 'list', { group: 'actions' }),
        { ...descField, group: 'lore' },
        f('notes', 'Notes perso', 'rich', { group: 'lore' }),
      ],
    },
  },
  {
    id: CAT.spell, slug: 'spell', name: 'Sort', icon: 'sparkles',
    schema: {
      fields: [
        f('level', 'Niveau', 'number'),
        f('school', 'École', 'text'),
        f('casting', 'Temps d’incantation', 'text'),
        f('range', 'Portée', 'text'),
        f('components', 'Composantes', 'text'),
        f('duration', 'Durée', 'text'),
        f('classes', 'Classes', 'tags'),
        descField,
        f('higher', 'Aux niveaux supérieurs', 'rich'),
      ],
    },
  },
  {
    id: CAT.weapon, slug: 'weapon', name: 'Arme', icon: 'sword',
    schema: {
      fields: [
        f('type', 'Type', 'text'),
        f('damage', 'Dégâts', 'text'),
        f('properties', 'Propriétés', 'tags'),
        f('range', 'Portée', 'text'),
        f('price', 'Prix', 'text'),
        f('weight', 'Poids', 'text'),
        descField,
      ],
    },
  },
  {
    id: CAT.armor, slug: 'armor', name: 'Armure', icon: 'shield',
    schema: {
      fields: [
        f('type', 'Type', 'text'),
        f('ac', 'Classe d’armure', 'text'),
        f('str_min', 'Force minimale', 'text'),
        f('stealth', 'Discrétion', 'text'),
        f('price', 'Prix', 'text'),
        f('weight', 'Poids', 'text'),
        descField,
      ],
    },
  },
  {
    id: CAT.gear, slug: 'gear', name: 'Équipement', icon: 'backpack',
    schema: {
      fields: [
        f('category', 'Catégorie', 'text'),
        f('price', 'Prix', 'text'),
        f('weight', 'Poids', 'text'),
        descField,
      ],
    },
  },
  {
    id: CAT.magicItem, slug: 'magic-item', name: 'Objet magique', icon: 'wand',
    schema: {
      fields: [
        f('type', 'Type', 'text'),
        f('rarity', 'Rareté', 'text'),
        descField,
      ],
    },
  },
  {
    id: CAT.race, slug: 'race', name: 'Race', icon: 'users',
    schema: {
      fields: [
        f('size', 'Taille', 'text'),
        f('speed', 'Vitesse', 'text'),
        f('traits', 'Traits', 'tags'),
        descField,
      ],
    },
  },
  {
    id: CAT.klass, slug: 'class', name: 'Classe', icon: 'graduation-cap',
    schema: {
      fields: [
        f('hit_die', 'Dé de vie', 'text'),
        f('saves', 'Jets de sauvegarde', 'text'),
        f('proficiencies', 'Maîtrises', 'tags'),
        descField,
      ],
    },
  },
  {
    id: CAT.feat, slug: 'feat', name: 'Don', icon: 'star',
    schema: { fields: [f('prerequisites', 'Prérequis', 'text'), descField] },
  },
  {
    id: CAT.condition, slug: 'condition', name: 'État', icon: 'alert-circle',
    schema: { fields: [descField] },
  },
  {
    id: CAT.background, slug: 'background', name: 'Historique', icon: 'scroll',
    schema: { fields: [f('feature', 'Capacité', 'text'), descField] },
  },
  {
    id: CAT.rule, slug: 'rule', name: 'Règle', icon: 'book',
    schema: { fields: [descField] },
  },
  {
    id: CAT.feature, slug: 'feature', name: 'Aptitude', icon: 'zap',
    schema: { fields: [f('class', 'Classe', 'text'), f('level', 'Niveau', 'number'), descField] },
  },
  {
    id: CAT.reference, slug: 'reference', name: 'Référence', icon: 'book-open',
    schema: { fields: [f('type', 'Type', 'text'), descField] },
  },
];

// --- Helpers de mapping -----------------------------------------------------
const join = (arr, sep = '\n\n') => (Array.isArray(arr) ? arr.filter(Boolean).join(sep) : arr || '');
const descText = (d) => (Array.isArray(d) ? d.filter(Boolean).join('\n\n') : d || '');
const nameOf = (o) => o?.name ?? '';
const names = (arr) => (Array.isArray(arr) ? arr.map(nameOf).filter(Boolean) : []);

function speedStr(speed) {
  if (!speed || typeof speed !== 'object') return '';
  return Object.entries(speed).map(([k, v]) => `${k} ${v}`).join(', ');
}
function sensesStr(senses) {
  if (!senses || typeof senses !== 'object') return '';
  return Object.entries(senses).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ');
}

const MAP = {
  monster: (m) => {
    const saves = (m.proficiencies || [])
      .filter((p) => p.proficiency?.index?.startsWith('saving-throw'))
      .map((p) => `${p.proficiency.name.replace('Saving Throw: ', '')} +${p.value}`);
    const skills = (m.proficiencies || [])
      .filter((p) => p.proficiency?.index?.startsWith('skill'))
      .map((p) => `${p.proficiency.name.replace('Skill: ', '')} +${p.value}`);
    return {
      categoryId: CAT.monster,
      name: m.name,
      summary: `${m.size} ${m.type}, FP ${m.challenge_rating}`,
      tags: [m.type, m.size, `FP ${m.challenge_rating}`].filter(Boolean),
      data: {
        type: m.subtype ? `${m.type} (${m.subtype})` : m.type,
        size: m.size,
        alignment: m.alignment,
        ac: m.armor_class?.[0]?.value,
        hp: m.hit_points,
        speed: speedStr(m.speed),
        abilities: {
          FOR: m.strength, DEX: m.dexterity, CON: m.constitution,
          INT: m.intelligence, SAG: m.wisdom, CHA: m.charisma,
        },
        saves: saves.join(', '),
        skills: skills.join(', '),
        resistances: m.damage_resistances || [],
        immunities: [...(m.damage_immunities || []), ...names(m.condition_immunities)],
        senses: sensesStr(m.senses),
        languages: m.languages,
        cr: String(m.challenge_rating),
        actions: (m.actions || []).map((a) => `${a.name} — ${a.desc}`),
        reactions: (m.reactions || []).map((a) => `${a.name} — ${a.desc}`),
        legendary: (m.legendary_actions || []).map((a) => `${a.name} — ${a.desc}`),
        description: (m.special_abilities || []).map((s) => `${s.name}. ${s.desc}`).join('\n\n'),
      },
    };
  },

  spell: (s) => ({
    categoryId: CAT.spell,
    name: s.name,
    summary: s.level === 0 ? `Tour de magie · ${nameOf(s.school)}` : `Niveau ${s.level} · ${nameOf(s.school)}`,
    tags: [nameOf(s.school), `niv ${s.level}`, ...names(s.classes)].filter(Boolean),
    data: {
      level: s.level,
      school: nameOf(s.school),
      casting: s.casting_time,
      range: s.range,
      components: (s.components || []).join(', ') + (s.material ? ` (${s.material})` : ''),
      duration: (s.concentration ? 'Concentration, ' : '') + (s.duration || ''),
      classes: names(s.classes),
      description: join(s.desc),
      higher: join(s.higher_level),
    },
  }),

  equipment: (e) => {
    const cat = e.equipment_category?.index;
    const price = e.cost ? `${e.cost.quantity} ${e.cost.unit}` : '';
    const weight = e.weight != null ? `${e.weight}` : '';
    if (cat === 'weapon') {
      const dmg = e.damage
        ? `${e.damage.damage_dice} ${nameOf(e.damage.damage_type)}` +
          (e.two_handed_damage ? ` (2 mains : ${e.two_handed_damage.damage_dice})` : '')
        : '';
      return {
        categoryId: CAT.weapon,
        name: e.name,
        summary: e.category_range,
        tags: [e.weapon_category, e.weapon_range].filter(Boolean),
        data: {
          type: e.category_range,
          damage: dmg,
          properties: names(e.properties),
          range: e.range ? `${e.range.normal}${e.range.long ? '/' + e.range.long : ''}` : '',
          price, weight, description: join(e.desc, '\n'),
        },
      };
    }
    if (cat === 'armor') {
      const ac = e.armor_class
        ? `${e.armor_class.base}${e.armor_class.dex_bonus ? ' + Dex' : ''}` +
          (e.armor_class.max_bonus ? ` (max +${e.armor_class.max_bonus})` : '')
        : '';
      return {
        categoryId: CAT.armor,
        name: e.name,
        summary: e.armor_category,
        tags: [e.armor_category].filter(Boolean),
        data: {
          type: e.armor_category,
          ac,
          str_min: e.str_minimum ? `${e.str_minimum}` : '',
          stealth: e.stealth_disadvantage ? 'Désavantage' : '',
          price, weight, description: join(e.desc, '\n'),
        },
      };
    }
    return {
      categoryId: CAT.gear,
      name: e.name,
      summary: e.equipment_category?.name,
      tags: [e.equipment_category?.name].filter(Boolean),
      data: { category: e.equipment_category?.name, price, weight, description: join(e.desc, '\n') },
    };
  },

  magicItem: (mi) => ({
    categoryId: CAT.magicItem,
    name: mi.name,
    summary: nameOf(mi.rarity),
    tags: [nameOf(mi.rarity), mi.equipment_category?.name].filter(Boolean),
    data: {
      type: mi.equipment_category?.name,
      rarity: nameOf(mi.rarity),
      description: join(mi.desc),
    },
  }),

  race: (r) => ({
    categoryId: CAT.race,
    name: r.name,
    summary: `${r.size || ''} · ${r.speed ? r.speed + ' ft' : ''}`.trim(),
    tags: [r.size].filter(Boolean),
    data: {
      size: r.size,
      speed: r.speed ? `${r.speed} ft` : '',
      traits: names(r.traits),
      description: [r.alignment, r.age, r.size_description, r.language_desc].filter(Boolean).join('\n\n'),
    },
  }),

  klass: (c) => ({
    categoryId: CAT.klass,
    name: c.name,
    summary: `Dé de vie d${c.hit_die}`,
    tags: [],
    data: {
      hit_die: `d${c.hit_die}`,
      saves: names(c.saving_throws).join(', '),
      proficiencies: names(c.proficiencies),
      description: (c.proficiency_choices || [])
        .map((pc) => pc.desc)
        .filter(Boolean)
        .join('\n'),
    },
  }),

  feat: (ft) => ({
    categoryId: CAT.feat,
    name: ft.name,
    summary: 'Don',
    tags: [],
    data: {
      prerequisites: (ft.prerequisites || [])
        .map((p) => p.ability_score?.name + ' ' + p.minimum_score)
        .join(', '),
      description: join(ft.desc),
    },
  }),

  condition: (c) => ({
    categoryId: CAT.condition,
    name: c.name,
    summary: 'État',
    tags: [],
    data: { description: join(c.desc, '\n') },
  }),

  background: (b) => ({
    categoryId: CAT.background,
    name: b.name,
    summary: 'Historique',
    tags: [],
    data: { feature: b.feature?.name, description: join(b.feature?.desc) },
  }),

  rule: (rs) => ({
    categoryId: CAT.rule,
    name: rs.name,
    summary: 'Règle',
    tags: [],
    data: { description: rs.desc },
  }),

  subrace: (sr) => ({
    categoryId: CAT.race,
    name: sr.name,
    summary: sr.race?.name ? `Sous-race de ${sr.race.name}` : 'Sous-race',
    tags: ['sous-race', sr.race?.name].filter(Boolean),
    data: { traits: names(sr.racial_traits), description: descText(sr.desc) },
  }),

  subclass: (sc) => ({
    categoryId: CAT.klass,
    name: sc.name,
    summary: sc.class?.name ? `Sous-classe de ${sc.class.name}` : 'Sous-classe',
    tags: ['sous-classe', sc.class?.name].filter(Boolean),
    data: { description: descText(sc.desc) },
  }),

  feature: (ft) => ({
    categoryId: CAT.feature,
    name: ft.name,
    summary: `${ft.class?.name || ''}${ft.level ? ' · niv ' + ft.level : ''}`.trim(),
    tags: [ft.class?.name, ft.subclass?.name].filter(Boolean),
    data: { class: ft.class?.name, level: ft.level, description: descText(ft.desc) },
  }),
};

// Fabrique de mappers pour la catégorie « Référence » (listes courtes).
const refMap = (typeLabel, tag, body) => (x) => ({
  categoryId: CAT.reference,
  name: x.name,
  summary: typeLabel,
  tags: [tag],
  data: { type: typeLabel, description: body(x) },
});

// --- Datasets (clé, URL, mapper) -------------------------------------------
const DATASETS = [
  { key: 'monster', url: `${RAW}/en/5e-SRD-Monsters.json`, map: MAP.monster },
  { key: 'spell', url: `${RAW}/fr-FR/5e-SRD-Spells.json`, map: MAP.spell },
  { key: 'equipment', url: `${RAW}/en/5e-SRD-Equipment.json`, map: MAP.equipment },
  { key: 'magic-item', url: `${RAW}/en/5e-SRD-Magic-Items.json`, map: MAP.magicItem },
  { key: 'race', url: `${RAW}/fr-FR/5e-SRD-Races.json`, map: MAP.race },
  { key: 'class', url: `${RAW}/fr-FR/5e-SRD-Classes.json`, map: MAP.klass },
  { key: 'feat', url: `${RAW}/fr-FR/5e-SRD-Feats.json`, map: MAP.feat },
  { key: 'condition', url: `${RAW}/fr-FR/5e-SRD-Conditions.json`, map: MAP.condition },
  { key: 'background', url: `${RAW}/fr-FR/5e-SRD-Backgrounds.json`, map: MAP.background },
  { key: 'rule', url: `${RAW}/fr-FR/5e-SRD-Rule-Sections.json`, map: MAP.rule },
  // Compléments : tout le reste du SRD (en français).
  { key: 'subrace', url: `${RAW}/fr-FR/5e-SRD-Subraces.json`, map: MAP.subrace },
  { key: 'subclass', url: `${RAW}/fr-FR/5e-SRD-Subclasses.json`, map: MAP.subclass },
  { key: 'feature', url: `${RAW}/fr-FR/5e-SRD-Features.json`, map: MAP.feature },
  { key: 'trait', url: `${RAW}/fr-FR/5e-SRD-Traits.json`, map: refMap('Trait racial', 'trait racial', (x) => descText(x.desc)) },
  { key: 'skill', url: `${RAW}/fr-FR/5e-SRD-Skills.json`, map: (x) => ({ categoryId: CAT.reference, name: x.name, summary: `Compétence (${x.ability_score?.name || ''})`, tags: ['compétence'], data: { type: `Compétence (${x.ability_score?.name || ''})`, description: descText(x.desc) } }) },
  { key: 'language', url: `${RAW}/fr-FR/5e-SRD-Languages.json`, map: refMap('Langue', 'langue', (x) => [x.type, x.typical_speakers?.length ? 'Locuteurs : ' + x.typical_speakers.join(', ') : '', x.script ? 'Écriture : ' + x.script : ''].filter(Boolean).join('\n')) },
  { key: 'magic-school', url: `${RAW}/fr-FR/5e-SRD-Magic-Schools.json`, map: refMap('École de magie', 'école de magie', (x) => descText(x.desc)) },
  { key: 'damage-type', url: `${RAW}/fr-FR/5e-SRD-Damage-Types.json`, map: refMap('Type de dégâts', 'type de dégâts', (x) => descText(x.desc)) },
  { key: 'weapon-property', url: `${RAW}/fr-FR/5e-SRD-Weapon-Properties.json`, map: refMap('Propriété d’arme', 'propriété d’arme', (x) => descText(x.desc)) },
  { key: 'alignment', url: `${RAW}/fr-FR/5e-SRD-Alignments.json`, map: refMap('Alignement', 'alignement', (x) => descText(x.desc)) },
  { key: 'ability-score', url: `${RAW}/fr-FR/5e-SRD-Ability-Scores.json`, map: refMap('Caractéristique', 'caractéristique', (x) => descText(x.desc)) },
];

// --- Upsert helpers ---------------------------------------------------------
async function upsertCategories() {
  const rows = CATEGORIES.map((c) => ({
    id: c.id, slug: c.slug, name: c.name, icon: c.icon,
    schema: c.schema, default_tags: [], is_system: true, owner_id: null,
  }));
  const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log(`✓ ${rows.length} catégories`);
}

async function upsertEntities(rows) {
  const SIZE = 300;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await supabase.from('entities').upsert(batch, { onConflict: 'id' });
    if (error) throw error;
    process.stdout.write(`  …${Math.min(i + SIZE, rows.length)}/${rows.length}\r`);
  }
}

async function run() {
  console.log(`Import SRD → ${SUPABASE_URL}`);
  await upsertCategories();

  let grandTotal = 0;
  for (const ds of DATASETS) {
    try {
      const res = await fetch(ds.url);
      if (!res.ok) {
        console.warn(`⚠ ${ds.key} : HTTP ${res.status} (ignoré)`);
        continue;
      }
      const items = await res.json();
      const rows = items.map((item) => {
        const mapped = ds.map(item);
        return {
          id: uuidv5(`${ds.key}:${item.index}`, NS),
          category_id: mapped.categoryId,
          owner_id: null,
          kind: 'source',
          visibility: 'official',
          parent_id: null,
          name: mapped.name,
          summary: mapped.summary || null,
          data: mapped.data,
          tags: mapped.tags || [],
          license: LICENSE,
          source_name: SOURCE,
          rev: 1,
          is_default_variant: false,
        };
      });
      await upsertEntities(rows);
      grandTotal += rows.length;
      console.log(`✓ ${ds.key.padEnd(12)} ${rows.length} entités`);
    } catch (e) {
      console.error(`❌ ${ds.key} :`, e.message);
    }
  }
  console.log(`\n✅ Terminé — ${grandTotal} entités source importées.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
