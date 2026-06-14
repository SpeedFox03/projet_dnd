/**
 * Traduction FR (dictionnaire, sans API) des fiches SRD anglaises restantes :
 * monstres, équipement, objets magiques. Ré-écrit les mêmes lignes (UUID v5
 * déterministes) dans Supabase avec les valeurs traduites.
 *
 *  - Champs structurés (taille, type, alignement, sens, compétences, dégâts,
 *    états, raretés, propriétés…) : traduction EXACTE par dictionnaire.
 *  - Distances : converties en mètres (1 ft ≈ 0,30 m).
 *  - Résumés : régénérés en français.
 *  - Prose (attaques, capacités, descriptions) et noms : passe best-effort.
 *
 * Lancement :  node scripts/translate-fr.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';

// --- env --------------------------------------------------------------------
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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NS = 'b6c1f3e2-5d4a-4c3b-9e2a-1f2d3c4b5a6e';
const RAW = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014';
const CAT = {
  monster: '00000000-0000-0000-0000-000000000001',
  weapon: '00000000-0000-0000-0000-000000000003',
  armor: '00000000-0000-0000-0000-000000000004',
  gear: '00000000-0000-0000-0000-000000000005',
  magicItem: '00000000-0000-0000-0000-000000000006',
};

// --- Dictionnaires ----------------------------------------------------------
const SIZE = { Tiny: 'très petit', Small: 'petit', Medium: 'moyen', Large: 'grand', Huge: 'très grand', Gargantuan: 'gigantesque' };
const TYPE = {
  aberration: 'aberration', beast: 'bête', celestial: 'céleste', construct: 'créature artificielle',
  dragon: 'dragon', elemental: 'élémentaire', fey: 'fée', fiend: 'fiélon', giant: 'géant',
  humanoid: 'humanoïde', monstrosity: 'monstruosité', ooze: 'vase', plant: 'plante', undead: 'mort-vivant', swarm: 'nuée',
};
const ALIGN_WORD = { lawful: 'Loyal', chaotic: 'Chaotique', neutral: 'Neutre', good: 'Bon', evil: 'Mauvais', unaligned: 'Non-aligné', any: 'au choix' };
const SPEED_KEY = { walk: 'marche', fly: 'vol', swim: 'nage', climb: 'escalade', burrow: 'fouissement', hover: 'sur place' };
const SENSE_KEY = { darkvision: 'vision dans le noir', blindsight: 'perception aveugle', tremorsense: 'perception des vibrations', truesight: 'vision parfaite', passive_perception: 'Perception passive' };
const SKILL = {
  Acrobatics: 'Acrobaties', 'Animal Handling': 'Dressage', Arcana: 'Arcanes', Athletics: 'Athlétisme', Deception: 'Tromperie',
  History: 'Histoire', Insight: 'Perspicacité', Intimidation: 'Intimidation', Investigation: 'Investigation', Medicine: 'Médecine',
  Nature: 'Nature', Perception: 'Perception', Performance: 'Représentation', Persuasion: 'Persuasion', Religion: 'Religion',
  'Sleight of Hand': 'Escamotage', Stealth: 'Discrétion', Survival: 'Survie',
};
const ABILITY3 = { STR: 'FOR', DEX: 'DEX', CON: 'CON', INT: 'INT', WIS: 'SAG', CHA: 'CHA' };
const DAMAGE = {
  slashing: 'tranchant', piercing: 'perforant', bludgeoning: 'contondant', fire: 'feu', cold: 'froid', lightning: 'foudre',
  thunder: 'tonnerre', acid: 'acide', poison: 'poison', necrotic: 'nécrotique', radiant: 'radiant', psychic: 'psychique', force: 'force',
};
const CONDITION = {
  blinded: 'aveuglé', charmed: 'charmé', deafened: 'assourdi', frightened: 'effrayé', grappled: 'agrippé', incapacitated: 'neutralisé',
  invisible: 'invisible', paralyzed: 'paralysé', petrified: 'pétrifié', poisoned: 'empoisonné', prone: 'à terre', restrained: 'entravé',
  stunned: 'étourdi', unconscious: 'inconscient', exhaustion: 'épuisement',
};
const LANG = {
  Common: 'commun', Draconic: 'draconique', Goblin: 'gobelin', Orc: 'orc', Elvish: 'elfique', Dwarvish: 'nain', Giant: 'géant',
  Gnomish: 'gnome', Halfling: 'halfelin', Abyssal: 'abyssal', Infernal: 'infernal', Celestial: 'céleste', Sylvan: 'sylvestre',
  Undercommon: 'profond', Primordial: 'primordial', Terran: 'terreux', Aquan: 'aquatique', Auran: 'aérien', Ignan: 'ignée', Deep: 'des profondeurs',
  all: 'toutes', 'all languages': 'toutes les langues', any: 'au choix',
};
const RARITY = { Common: 'Commun', Uncommon: 'Peu commun', Rare: 'Rare', 'Very Rare': 'Très rare', Legendary: 'Légendaire', Artifact: 'Artéfact', Varies: 'Variable' };
const MI_TYPE = { Weapon: 'Arme', Armor: 'Armure', 'Wondrous Items': 'Objet merveilleux', Ring: 'Anneau', Rod: 'Sceptre', Staff: 'Bâton', Wand: 'Baguette', Potion: 'Potion', Scroll: 'Parchemin' };
const WPROP = { Ammunition: 'Munitions', Finesse: 'Finesse', Heavy: 'Lourde', Light: 'Légère', Loading: 'Chargement', Range: 'Distance', Reach: 'Allonge', Special: 'Spéciale', Thrown: 'À lancer', 'Two-Handed': 'À deux mains', Versatile: 'Polyvalente', Net: 'Filet' };
const ARMOR_CAT = { Light: 'Légère', Medium: 'Intermédiaire', Heavy: 'Lourde', Shield: 'Bouclier' };
const NAME_WORDS = {
  Adult: 'adulte',
  Ancient: 'ancien',
  Acolyte: 'acolyte',
  Bandit: 'bandit',
  Bat: 'chauve-souris',
  Bear: 'ours',
  Black: 'noir',
  Blue: 'bleu',
  Boar: 'sanglier',
  Bone: 'osseux',
  Brass: 'laiton',
  Bronze: 'bronze',
  Copper: 'cuivre',
  Cultist: 'cultiste',
  Demon: 'démon',
  Devil: 'diable',
  Dire: 'sinistre',
  Dragon: 'dragon',
  Eagle: 'aigle',
  Elemental: 'élémentaire',
  Fire: 'feu',
  Ghost: 'fantôme',
  Ghoul: 'goule',
  Giant: 'géant',
  Goblin: 'gobelin',
  Gold: 'doré',
  Golem: 'golem',
  Green: 'vert',
  Guard: 'garde',
  Hag: 'guenaude',
  Halfling: 'halfelin',
  Knight: 'chevalier',
  Kobold: 'kobold',
  Lesser: 'inférieur',
  Lion: 'lion',
  Mage: 'mage',
  Noble: 'noble',
  Ogre: 'ogre',
  Orc: 'orc',
  Priest: 'prêtre',
  Rat: 'rat',
  Red: 'rouge',
  Silver: 'argenté',
  Skeleton: 'squelette',
  Snake: 'serpent',
  Spider: 'araignée',
  Swarm: 'nuée',
  Tiger: 'tigre',
  Troll: 'troll',
  Vampire: 'vampire',
  White: 'blanc',
  Wolf: 'loup',
  Wyrmling: 'dragonnet',
  Young: 'jeune',
  Water: 'eau',
  Air: 'air',
  Earth: 'terre',
  Commoner: 'roturier',
};

// --- Helpers ----------------------------------------------------------------
const tr = (dict, v) => (v == null ? v : dict[v] ?? v);
const dist = (s) =>
  String(s)
    .replace(/(\d+)\s*\/\s*(\d+)\s*ft\.?/g, (_, a, b) => `${meters(a)}/${meters(b)} m`)
    .replace(/(\d+)\s*ft\.?/g, (_, a) => `${meters(a)} m`);
function meters(ft) {
  const m = Math.round(Number(ft) * 0.3 * 100) / 100;
  return String(m).replace('.', ',');
}

// Passe « prose » : remplace les tournures de bloc de stats les plus fréquentes.
const PROSE = [
  [/Melee or Ranged Weapon Attack:/g, 'Attaque d’arme au corps à corps ou à distance :'],
  [/Melee Weapon Attack:/g, 'Attaque d’arme au corps à corps :'],
  [/Ranged Weapon Attack:/g, 'Attaque d’arme à distance :'],
  [/Melee Spell Attack:/g, 'Attaque de sort au corps à corps :'],
  [/Ranged Spell Attack:/g, 'Attaque de sort à distance :'],
  [/\bto hit\b/g, 'au toucher'],
  [/\bHit:/g, 'Touché :'],
  [/\bMiss:/g, 'Raté :'],
  [/\breach\b/g, 'allonge'],
  [/\brange\b/g, 'portée'],
  [/\bone target\b/g, 'une cible'],
  [/\bone creature\b/g, 'une créature'],
  [/\bsaving throw\b/g, 'jet de sauvegarde'],
  [/\bMultiattack\b/g, 'Attaques multiples'],
  [/\bbonus action\b/g, 'action bonus'],
  [/\breaction\b/g, 'réaction'],
  [/\bdifficult terrain\b/g, 'terrain difficile'],
  [/\bStrength\b/g, 'Force'], [/\bDexterity\b/g, 'Dextérité'], [/\bConstitution\b/g, 'Constitution'],
  [/\bIntelligence\b/g, 'Intelligence'], [/\bWisdom\b/g, 'Sagesse'], [/\bCharisma\b/g, 'Charisme'],
  [/\bdarkvision\b/gi, 'vision dans le noir'],
  [/\bdamage\b/g, 'dégâts'],
];
function prose(text) {
  if (!text) return text;
  let s = dist(text);
  for (const [re, rep] of PROSE) s = s.replace(re, rep);
  for (const [en, fr] of Object.entries(DAMAGE)) s = s.replace(new RegExp(`\\b${en}\\b`, 'g'), fr);
  for (const [en, fr] of Object.entries(CONDITION)) s = s.replace(new RegExp(`\\b${en}\\b`, 'g'), fr);
  return s;
}
function translateName(name) {
  if (!name) return name;

  const words = name.trim().split(/\s+/).filter(Boolean);
  const ageMap = { Adult: 'adulte', Ancient: 'ancien', Young: 'jeune' };
  const colorMap = { Red: 'rouge', Blue: 'bleu', Green: 'vert', White: 'blanc', Black: 'noir', Gold: 'doré', Silver: 'argenté', Bronze: 'bronze', Brass: 'laiton', Copper: 'cuivre' };

  if (words.length >= 2 && colorMap[words[0]] && NAME_WORDS[words[1]]) {
    const noun = NAME_WORDS[words[1]] || 'dragon';
    const suffix = words.slice(2)
      .map((w) => ageMap[w] ?? NAME_WORDS[w] ?? NAME_WORDS[w.toLowerCase()] ?? w)
      .filter(Boolean)
      .join(' ');
    const phrase = `${noun} de ${colorMap[words[0]]}${suffix ? ` ${suffix}` : ''}`;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  if (words.length >= 3 && ageMap[words[0]] && colorMap[words[1]] && NAME_WORDS[words[2]]) {
    const noun = NAME_WORDS[words[2]] || 'dragon';
    const phrase = `${noun} de ${colorMap[words[1]]} ${ageMap[words[0]]}`;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  if (words.length >= 2 && NAME_WORDS[words[0]] && NAME_WORDS[words[1]] && !ageMap[words[0]] && !colorMap[words[0]]) {
    const phrase = `${NAME_WORDS[words[1]]} ${NAME_WORDS[words[0]]}`;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  if (words.length >= 2 && ageMap[words[0]] && NAME_WORDS[words[1]]) {
    const phrase = `${NAME_WORDS[words[1]]} ${ageMap[words[0]]}`;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  return name
    .split(/(\b|\s|[-’']+)/)
    .map((tok) => {
      const clean = tok.trim();
      if (!clean) return tok;
      return NAME_WORDS[clean] ?? NAME_WORDS[clean.toLowerCase()] ?? tok;
    })
    .join('');
}
function alignment(a) {
  if (!a) return a;
  return a.split(/\s+/).map((w) => ALIGN_WORD[w.toLowerCase()] ?? w).join(' ');
}

// --- Mappers traduits -------------------------------------------------------
function monster(m) {
  const sizeFr = tr(SIZE, m.size);
  const typeFr = tr(TYPE, m.type);
  const sizeLabel = sizeFr ? sizeFr.charAt(0).toUpperCase() + sizeFr.slice(1) : '';
  const typeLabel = typeFr ? typeFr.charAt(0).toUpperCase() + typeFr.slice(1) : '';
  const saves = (m.proficiencies || []).filter((p) => p.proficiency?.index?.startsWith('saving-throw'))
    .map((p) => `${tr(ABILITY3, p.proficiency.name.replace('Saving Throw: ', '').toUpperCase().slice(0, 3))} +${p.value}`);
  const skills = (m.proficiencies || []).filter((p) => p.proficiency?.index?.startsWith('skill'))
    .map((p) => `${tr(SKILL, p.proficiency.name.replace('Skill: ', ''))} +${p.value}`);
  const speed = Object.entries(m.speed || {}).map(([k, v]) => `${tr(SPEED_KEY, k)} ${dist(v)}`).join(', ');
  const senses = Object.entries(m.senses || {}).map(([k, v]) => `${tr(SENSE_KEY, k)} ${dist(v)}`).join(', ');
  const langs = (m.languages || '').split(/,\s*/).map((l) => tr(LANG, l.trim())).join(', ');
  return {
    id: uuidv5(`monster:${m.index}`, NS),
    category_id: CAT.monster,
    name: translateName(m.name),
    summary: `${sizeLabel} ${typeLabel}, FP ${m.challenge_rating}`,
    tags: [typeLabel, sizeLabel, `FP ${m.challenge_rating}`].filter(Boolean),
    data: {
      type: m.subtype ? `${typeFr} (${m.subtype})` : typeFr,
      size: sizeFr,
      alignment: alignment(m.alignment),
      ac: m.armor_class?.[0]?.value,
      hp: m.hit_points,
      speed,
      abilities: { FOR: m.strength, DEX: m.dexterity, CON: m.constitution, INT: m.intelligence, SAG: m.wisdom, CHA: m.charisma },
      saves: saves.join(', '),
      skills: skills.join(', '),
      resistances: (m.damage_resistances || []).map((d) => prose(d)),
      immunities: [...(m.damage_immunities || []).map((d) => prose(d)), ...(m.condition_immunities || []).map((c) => tr(CONDITION, c.index) || c.name)],
      senses,
      languages: langs,
      cr: String(m.challenge_rating),
      actions: (m.actions || []).map((a) => `${a.name} — ${prose(a.desc)}`),
      reactions: (m.reactions || []).map((a) => `${a.name} — ${prose(a.desc)}`),
      legendary: (m.legendary_actions || []).map((a) => `${a.name} — ${prose(a.desc)}`),
      description: (m.special_abilities || []).map((s) => `${s.name}. ${prose(s.desc)}`).join('\n\n'),
    },
  };
}

function equipment(e) {
  const cat = e.equipment_category?.index;
  const price = e.cost ? `${e.cost.quantity} ${e.cost.unit === 'gp' ? 'po' : e.cost.unit === 'sp' ? 'pa' : e.cost.unit === 'cp' ? 'pc' : e.cost.unit}` : '';
  const weight = e.weight != null ? `${e.weight}` : '';
  if (cat === 'weapon') {
    const wcat = e.weapon_category === 'Martial' ? 'Martiale' : 'Courante';
    const wrange = e.weapon_range === 'Ranged' ? 'à distance' : 'de corps à corps';
    const dmg = e.damage ? `${e.damage.damage_dice} ${tr(DAMAGE, e.damage.damage_type?.index)}` + (e.two_handed_damage ? ` (2 mains : ${e.two_handed_damage.damage_dice})` : '') : '';
    return {
      id: uuidv5(`equipment:${e.index}`, NS), category_id: CAT.weapon, name: translateName(e.name),
      summary: `Arme ${wcat} ${wrange}`, tags: [wcat, wrange].filter(Boolean),
      data: { type: `Arme ${wcat} ${wrange}`, damage: dmg, properties: (e.properties || []).map((p) => tr(WPROP, p.name)), range: e.range ? dist(`${e.range.normal}${e.range.long ? '/' + e.range.long : ''} ft.`) : '', price, weight, description: prose((e.desc || []).join('\n')) },
    };
  }
  if (cat === 'armor') {
    const acat = tr(ARMOR_CAT, e.armor_category);
    const ac = e.armor_class ? `${e.armor_class.base}${e.armor_class.dex_bonus ? ' + Dex' : ''}` + (e.armor_class.max_bonus ? ` (max +${e.armor_class.max_bonus})` : '') : '';
    return {
      id: uuidv5(`equipment:${e.index}`, NS), category_id: CAT.armor, name: translateName(e.name),
      summary: `Armure ${acat}`, tags: [acat].filter(Boolean),
      data: { type: `Armure ${acat}`, ac, str_min: e.str_minimum ? `${e.str_minimum}` : '', stealth: e.stealth_disadvantage ? 'Désavantage' : '', price, weight, description: prose((e.desc || []).join('\n')) },
    };
  }
  return {
    id: uuidv5(`equipment:${e.index}`, NS), category_id: CAT.gear, name: translateName(e.name),
    summary: e.equipment_category?.name, tags: [],
    data: { category: e.equipment_category?.name, price, weight, description: prose((e.desc || []).join('\n')) },
  };
}

function magicItem(mi) {
  const rarity = tr(RARITY, mi.rarity?.name);
  const type = tr(MI_TYPE, mi.equipment_category?.name);
  return {
    id: uuidv5(`magic-item:${mi.index}`, NS), category_id: CAT.magicItem, name: translateName(mi.name),
    summary: rarity, tags: [rarity, type].filter(Boolean),
    data: { type, rarity, description: prose((mi.desc || []).join('\n\n')) },
  };
}

// --- Run --------------------------------------------------------------------
const COMMON = { owner_id: null, kind: 'source', visibility: 'official', parent_id: null, license: 'CC-BY-4.0 (SRD 5.1)', source_name: 'SRD 5.1', rev: 1, is_default_variant: false };

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await supabase.from('entities').upsert(rows.slice(i, i + 300).map((r) => ({ ...COMMON, ...r })), { onConflict: 'id' });
    if (error) throw error;
  }
}

async function run() {
  const sets = [
    { name: 'monstres', url: `${RAW}/en/5e-SRD-Monsters.json`, map: monster },
    { name: 'équipement', url: `${RAW}/en/5e-SRD-Equipment.json`, map: equipment },
    { name: 'objets magiques', url: `${RAW}/en/5e-SRD-Magic-Items.json`, map: magicItem },
  ];
  let total = 0;
  for (const s of sets) {
    const items = await (await fetch(s.url)).json();
    const rows = items.map(s.map);
    await upsert(rows);
    total += rows.length;
    console.log(`✓ ${s.name.padEnd(16)} ${rows.length} fiches traduites`);
  }
  console.log(`\n✅ ${total} fiches traduites en français.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
