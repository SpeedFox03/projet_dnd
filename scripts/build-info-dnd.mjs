/**
 * Build a local D&D knowledge seed from the PDFs dropped in ./info_dnd.
 *
 * Outputs:
 * - public/data/info-dnd.generated.json  (used by the app's local Dexie seed)
 * - supabase/info_dnd_seed.sql           (optional SQL seed for Supabase)
 * - public/images/info-dnd/covers/*.png  (cover thumbnails rendered from PDFs)
 *
 * Run:
 *   node scripts/build-info-dnd.mjs
 *   node scripts/build-info-dnd.mjs --force-images
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';
import { v5 as uuidv5 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INFO_DIR = path.join(ROOT, 'info_dnd');
const OCR_DIR = path.join(ROOT, 'info_dnd_ocr');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const IMAGE_DIR = path.join(ROOT, 'public', 'images', 'info-dnd');
const COVER_DIR = path.join(IMAGE_DIR, 'covers');
const JSON_OUT = path.join(DATA_DIR, 'info-dnd.generated.json');
const SQL_OUT = path.join(ROOT, 'supabase', 'info_dnd_seed.sql');
const FORCE_IMAGES = process.argv.includes('--force-images');

const NS = '5893b6a0-6c48-4f60-9f4e-9da3de30d7d1';
const GENERATED_AT = new Date().toISOString();
const LICENSE_LOCAL = 'PDF local fourni par l’utilisateur';
const LICENSE_AIDEDD = 'AideDD / SRD 5.0 OGL';

const CAT = {
  sourcebook: '10000000-0000-0000-0000-000000000001',
  campaign: '10000000-0000-0000-0000-000000000002',
  adventureSection: '10000000-0000-0000-0000-000000000003',
  monster: '10000000-0000-0000-0000-000000000004',
  spell: '10000000-0000-0000-0000-000000000005',
  playerOption: '10000000-0000-0000-0000-000000000006',
  rule: '10000000-0000-0000-0000-000000000007',
  item: '10000000-0000-0000-0000-000000000008',
  npc: '10000000-0000-0000-0000-000000000009',
  location: '10000000-0000-0000-0000-00000000000a',
  reference: '10000000-0000-0000-0000-00000000000b',
  animal: '10000000-0000-0000-0000-00000000000c',
  weapon: '10000000-0000-0000-0000-00000000000d',
  armor: '10000000-0000-0000-0000-00000000000e',
};

const f = (key, label, type, extra = {}) => ({ key, label, type, ...extra });

const categories = [
  category(CAT.sourcebook, 'sourcebook', 'Sources PDF', 'book-open', [
    f('type', 'Type', 'select', { options: ['Campagne', 'Compendium', 'Règles', 'Univers', 'Aide de jeu'] }),
    f('sourceFile', 'Fichier PDF', 'text'),
    f('pages', 'Pages', 'number'),
    f('coverImage', 'Couverture', 'image'),
    f('tableOfContents', 'Sommaire', 'rich'),
    f('notes', 'Notes', 'rich'),
  ]),
  category(CAT.campaign, 'campaign', 'Campagnes', 'map', [
    f('coverImage', 'Visuel', 'image'),
    f('mapImage', 'Carte', 'image'),
    f('levels', 'Niveaux', 'text'),
    f('setting', 'Cadre', 'text'),
    f('sourceFile', 'Source', 'text'),
    f('synopsis', 'Synopsis MJ', 'rich'),
    f('chapters', 'Structure', 'list'),
    f('hooks', 'Accroches', 'list'),
  ]),
  category(CAT.adventureSection, 'adventure-section', 'Chapitres & scènes', 'landmark', [
    f('campaign', 'Campagne', 'text'),
    f('kind', 'Type', 'select', { options: ['Chapitre', 'Épisode', 'Lieu', 'Annexe', 'Rencontre', 'Section'] }),
    f('sourceFile', 'Source', 'text'),
    f('pageStart', 'Page début', 'number'),
    f('pageEnd', 'Page fin', 'number'),
    f('content', 'Contenu', 'rich'),
  ]),
  category(CAT.monster, 'monster', 'Monstres & blocs de stats', 'skull', [
    f('type', 'Type', 'text'),
    f('size', 'Taille', 'text'),
    f('alignment', 'Alignement', 'text'),
    f('ac', 'CA', 'number'),
    f('hp', 'PV', 'number'),
    f('hitDice', 'Dés de vie', 'text'),
    f('speed', 'Vitesse', 'text'),
    f('abilities', 'Caractéristiques', 'object'),
    f('saves', 'Jets de sauvegarde', 'text'),
    f('skills', 'Compétences', 'text'),
    f('resistances', 'Résistances', 'tags'),
    f('immunities', 'Immunités', 'tags'),
    f('senses', 'Sens', 'text'),
    f('languages', 'Langues', 'text'),
    f('cr', 'FP', 'text'),
    f('description', 'Traits & description', 'rich'),
    f('actions', 'Actions', 'list'),
    f('reactions', 'Réactions', 'list'),
    f('legendary', 'Actions légendaires', 'list'),
    f('sourceFile', 'Source', 'text'),
    f('sourcePage', 'Page', 'number'),
  ], [
    { key: 'identity', label: 'Identité' },
    { key: 'combat', label: 'Combat' },
    { key: 'actions', label: 'Actions' },
    { key: 'source', label: 'Provenance' },
  ]),
  category(CAT.animal, 'animal', 'Animaux', 'paw-print', [
    f('type', 'Type', 'text'),
    f('size', 'Taille', 'text'),
    f('alignment', 'Alignement', 'text'),
    f('ac', 'CA', 'number'),
    f('hp', 'PV', 'number'),
    f('hitDice', 'Dés de vie', 'text'),
    f('speed', 'Vitesse', 'text'),
    f('abilities', 'Caractéristiques', 'object'),
    f('saves', 'Jets de sauvegarde', 'text'),
    f('skills', 'Compétences', 'text'),
    f('resistances', 'Résistances', 'tags'),
    f('immunities', 'Immunités', 'tags'),
    f('senses', 'Sens', 'text'),
    f('languages', 'Langues', 'text'),
    f('cr', 'FP', 'text'),
    f('description', 'Traits & description', 'rich'),
    f('actions', 'Actions', 'list'),
    f('reactions', 'Réactions', 'list'),
    f('legendary', 'Actions légendaires', 'list'),
    f('sourceFile', 'Source', 'text'),
    f('sourcePage', 'Page', 'number'),
  ], [
    { key: 'identity', label: 'Identité' },
    { key: 'combat', label: 'Combat' },
    { key: 'actions', label: 'Actions' },
    { key: 'source', label: 'Provenance' },
  ]),
  category(CAT.weapon, 'weapon', 'Armes', 'swords', [
    f('type', 'Type', 'select', { options: ['Standard', 'Magique'] }),
    f('weaponCategory', 'Catégorie', 'select', { options: ['Courante', 'Guerre', 'Magique'] }),
    f('rangeType', 'Usage', 'select', { options: ['Corps à corps', 'Distance', 'Munition', 'Mixte'] }),
    f('baseWeapon', 'Arme de base', 'text'),
    f('damage', 'Dégâts', 'text'),
    f('damageDice', 'Dés de dégâts', 'text'),
    f('damageType', 'Type de dégâts', 'text'),
    f('price', 'Prix', 'text'),
    f('weight', 'Poids', 'text'),
    f('properties', 'Propriétés', 'tags'),
    f('range', 'Portée', 'text'),
    f('rarity', 'Rareté', 'text'),
    f('bonus', 'Bonus', 'text'),
    f('requiresAttunement', 'Harmonisation', 'boolean'),
    f('description', 'Description', 'rich'),
    f('sources', 'Sources repérées', 'list'),
    f('sourceFile', 'Source principale', 'text'),
    f('sourcePage', 'Page', 'number'),
  ], [
    { key: 'identity', label: 'Identité' },
    { key: 'stats', label: 'Statistiques' },
    { key: 'magic', label: 'Magie' },
    { key: 'source', label: 'Provenance' },
  ]),
  category(CAT.armor, 'armor', 'Armures & boucliers', 'shield', [
    f('type', 'Type', 'select', { options: ['Standard', 'Magique'] }),
    f('armorCategory', 'Catégorie', 'select', { options: ['Légère', 'Intermédiaire', 'Lourde', 'Bouclier', 'Magique'] }),
    f('baseArmor', 'Armure de base', 'text'),
    f('ac', 'CA', 'text'),
    f('strength', 'Force requise', 'text'),
    f('stealth', 'Discrétion', 'text'),
    f('price', 'Prix', 'text'),
    f('weight', 'Poids', 'text'),
    f('rarity', 'Rareté', 'text'),
    f('bonus', 'Bonus', 'text'),
    f('requiresAttunement', 'Harmonisation', 'boolean'),
    f('description', 'Description', 'rich'),
    f('sources', 'Sources repérées', 'list'),
    f('sourceFile', 'Source principale', 'text'),
    f('sourcePage', 'Page', 'number'),
  ], [
    { key: 'identity', label: 'Identité' },
    { key: 'stats', label: 'Statistiques' },
    { key: 'magic', label: 'Magie' },
    { key: 'source', label: 'Provenance' },
  ]),
  category(CAT.spell, 'spell', 'Sorts', 'sparkles', [
    f('level', 'Niveau', 'number'),
    f('school', 'École', 'text'),
    f('casting', 'Temps d’incantation', 'text'),
    f('range', 'Portée', 'text'),
    f('components', 'Composantes', 'text'),
    f('duration', 'Durée', 'text'),
    f('description', 'Description', 'rich'),
    f('higher', 'Aux niveaux supérieurs', 'rich'),
    f('sourceFile', 'Source', 'text'),
    f('sourcePage', 'Page', 'number'),
  ]),
  category(CAT.playerOption, 'player-option', 'Personnages', 'users', [
    f('type', 'Type', 'select', { options: ['Race', 'Classe', 'Sous-classe', 'Historique', 'Don', 'Option'] }),
    f('sourceFile', 'Source', 'text'),
    f('pageStart', 'Page début', 'number'),
    f('pageEnd', 'Page fin', 'number'),
    f('traits', 'Traits clés', 'list'),
    f('description', 'Description', 'rich'),
  ]),
  category(CAT.rule, 'rule', 'Règles & aides MJ', 'book', [
    f('type', 'Type', 'text'),
    f('sourceFile', 'Source', 'text'),
    f('pageStart', 'Page début', 'number'),
    f('pageEnd', 'Page fin', 'number'),
    f('description', 'Description', 'rich'),
  ]),
  category(CAT.item, 'item', 'Objets & trésors', 'gem', [
    f('type', 'Type', 'text'),
    f('rarity', 'Rareté', 'text'),
    f('price', 'Prix', 'text'),
    f('weight', 'Poids', 'text'),
    f('requiresAttunement', 'Harmonisation', 'boolean'),
    f('sourceFile', 'Source', 'text'),
    f('sourcePage', 'Page', 'number'),
    f('sources', 'Sources', 'list'),
    f('description', 'Description', 'rich'),
  ]),
  category(CAT.npc, 'npc', 'PNJ narratifs', 'user-round', [
    f('campaign', 'Campagne', 'text'),
    f('role', 'Rôle', 'text'),
    f('sourceFile', 'Source', 'text'),
    f('sourcePage', 'Page', 'number'),
    f('sources', 'Sources', 'list'),
    f('description', 'Description', 'rich'),
  ]),
  category(CAT.location, 'location', 'Lieux', 'map-pin', [
    f('campaign', 'Campagne', 'text'),
    f('region', 'Région', 'text'),
    f('mapImage', 'Carte', 'image'),
    f('sourceFile', 'Source', 'text'),
    f('sourcePage', 'Page', 'number'),
    f('description', 'Description', 'rich'),
  ]),
  category(CAT.reference, 'reference', 'Références', 'library', [
    f('type', 'Type', 'text'),
    f('sourceFile', 'Source', 'text'),
    f('pageStart', 'Page début', 'number'),
    f('pageEnd', 'Page fin', 'number'),
    f('description', 'Description', 'rich'),
  ]),
];

function category(id, slug, name, icon, fields, groups = undefined) {
  const fieldsWithGroups = fields.map((field) => {
    if (slug === 'monster' || slug === 'animal') {
      if (['type', 'size', 'alignment'].includes(field.key)) return { ...field, group: 'identity' };
      if (['ac', 'hp', 'hitDice', 'speed', 'abilities', 'saves', 'skills', 'resistances', 'immunities', 'senses', 'languages', 'cr'].includes(field.key)) {
        return { ...field, group: 'combat' };
      }
      if (['actions', 'reactions', 'legendary'].includes(field.key)) return { ...field, group: 'actions' };
      if (['sourceFile', 'sourcePage'].includes(field.key)) return { ...field, group: 'source' };
    }
    if (slug === 'weapon') {
      if (['type', 'weaponCategory', 'rangeType', 'baseWeapon'].includes(field.key)) return { ...field, group: 'identity' };
      if (['damage', 'damageDice', 'damageType', 'price', 'weight', 'properties', 'range'].includes(field.key)) return { ...field, group: 'stats' };
      if (['rarity', 'bonus', 'requiresAttunement', 'description'].includes(field.key)) return { ...field, group: 'magic' };
      if (['sources', 'sourceFile', 'sourcePage'].includes(field.key)) return { ...field, group: 'source' };
    }
    if (slug === 'armor') {
      if (['type', 'armorCategory', 'baseArmor'].includes(field.key)) return { ...field, group: 'identity' };
      if (['ac', 'strength', 'stealth', 'price', 'weight'].includes(field.key)) return { ...field, group: 'stats' };
      if (['rarity', 'bonus', 'requiresAttunement', 'description'].includes(field.key)) return { ...field, group: 'magic' };
      if (['sources', 'sourceFile', 'sourcePage'].includes(field.key)) return { ...field, group: 'source' };
    }
    return field;
  });
  return {
    id,
    slug,
    name,
    description: null,
    icon,
    schema: { groups, fields: fieldsWithGroups },
    displayTemplate: null,
    defaultTags: [],
    isSystem: true,
    ownerId: null,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
  };
}

const CAMPAIGNS = {
  'D&D5 - Le Trésor de la Reine Dragon.pdf': {
    title: 'Le Trésor de la Reine Dragon',
    levels: '1-7/8',
    setting: 'Côte des Épées',
    synopsis: 'Première moitié de Tyrannie des Dragons : le Culte du Dragon rassemble un trésor colossal et des alliés draconiques pour préparer le retour de Tiamat.',
    hooks: ['Une ville est attaquée par un dragon et des pillards.', 'Un érudit capturé peut révéler les plans du Culte du Dragon.', 'La piste du trésor mène vers le nord, jusqu’à une citadelle volante.'],
    chapters: ['Épisode 1 : Verdure en flammes', 'Épisode 2 : Le campement des pillards', 'Épisode 3 : L’écloserie', 'Épisode 4 : Sur la route', 'Épisode 5 : La loge de chasse', 'Épisode 6 : Le château Naerytar', 'Épisode 7 : Le pavillon de chasse', 'Épisode 8 : Le château dans les nuages'],
  },
  'D&D 5 - La Malédiction de Strahd.pdf': {
    title: 'La Malédiction de Strahd',
    levels: '1-10',
    setting: 'Barovie / Ravenloft',
    synopsis: 'Campagne gothique centrée sur Strahd von Zarovich, la Barovie prisonnière des brumes et la lutte des aventuriers pour survivre, comprendre et s’échapper.',
    hooks: ['Les brumes avalent les personnages et les déposent en Barovie.', 'Un tyran vampire surveille chaque choix du groupe.', 'Les cartes de Tarokka déterminent les alliés, reliques et lieux clés.'],
    chapters: ['Dans les brumes', 'Le village de Barovie', 'Vallaki', 'Le château de Ravenloft', 'Krezk', 'Le temple d’Ambre', 'Les lieux hantés de Barovie', 'Conclusion contre Strahd'],
  },
  "D&D 5 - La Tombe de l'Annihilation.pdf": {
    title: 'La Tombe de l’Annihilation',
    levels: '1-11',
    setting: 'Chult',
    synopsis: 'Une malédiction empêche les résurrections et consume ceux qui ont déjà été ramenés à la vie. La piste mène vers les jungles du Chult, Omu et le tombeau des neuf dieux.',
    hooks: ['Syndra Sylvaine engage le groupe pour retrouver l’Exacteur d’âmes.', 'Le Chult mélange exploration, factions, dinosaures et morts-vivants.', 'La fin de campagne est un méga-donjon létal.'],
    chapters: ['Introduction', 'Ch. 1 : Port Nyanzaru', 'Ch. 2 : Le Chult', 'Ch. 3 : Les ombres de la cité interdite', 'Ch. 4 : Le fanum du Serpent nocturne', 'Ch. 5 : Le Tombeau des neuf dieux', 'Annexes : historiques, rencontres, découvertes, monstres, aides de jeu'],
  },
  'D&D 5 - Le Tonnerre du Roi des Tempêtes.pdf': {
    title: 'Le Tonnerre du Roi des Tempêtes',
    levels: '1-11',
    setting: 'Le Nord / Côte des Épées',
    synopsis: 'L’Ordre des géants vacille et les peuples du Nord subissent les conséquences. Les personnages remontent les intrigues jusqu’à la cour du roi Hekaton.',
    hooks: ['Des attaques de géants bouleversent les routes et les cités.', 'Chaque famille de géants poursuit une ambition dangereuse.', 'La campagne se prête aux voyages et aux cartes régionales.'],
    chapters: ['Un grand chambardement', 'Rumeurs dans le Nord', 'Les frontières sauvages', 'Les tanières des géants', 'Maelstrom', 'Le roi disparu', 'Le destin des géants'],
  },
  'D&D 5 - Waterdeep - Le Vol des Dragons.pdf': {
    title: 'Waterdeep : Le Vol des Dragons',
    levels: '1-5',
    setting: 'Waterdeep',
    synopsis: 'Chasse au trésor urbaine dans la Cité des Splendeurs, sur fond de guerre des rues, de factions et d’antagonistes modulaires.',
    hooks: ['Volo confie une enquête qui ouvre sur une guerre de gangs.', 'Un demi-million de dragons d’or est caché dans la ville.', 'La saison choisie détermine l’antagoniste principal.'],
    chapters: ['Introduction', 'Ch. 1 : Un ami dans le besoin', 'Ch. 2 : L’allée du Crâne-de-Troll', 'Ch. 3 : Boule de feu', 'Ch. 4 : La saison des dragons', 'Ch. 5-8 : Antagonistes saisonniers', 'Ch. 9 : Enchiridion de Waterdeep', 'Annexes : objets, monstres, aides de jeu'],
  },
  'D&D 5 - Waterdeep - Le Donjon du Mage Dément.pdf': {
    title: 'Waterdeep : Le Donjon du Mage Dément',
    levels: '5-20',
    setting: 'Undermountain / Waterdeep',
    synopsis: 'Exploration de Montprofond, le méga-donjon de Halaster Sombrecape sous Waterdeep, conçu comme une campagne de longue progression.',
    hooks: ['Le Portail Béant donne accès aux profondeurs.', 'Chaque strate possède son écosystème, ses factions et ses secrets.', 'Halaster observe, manipule et attire les aventuriers toujours plus bas.'],
    chapters: ['Niveaux 1-23 d’Undermountain', 'Skullport', 'Factions souterraines', 'Halaster et ses apprentis', 'Finale de haut niveau'],
  },
  'D&D 5 - Waterdeep - Rencontres urbaines.pdf': {
    title: 'Waterdeep : Rencontres urbaines',
    levels: 'Variable',
    setting: 'Waterdeep',
    synopsis: 'Aide de jeu de rencontres urbaines pour enrichir une campagne à Waterdeep avec des scènes courtes, événements, complications et PNJ.',
    hooks: ['À utiliser entre deux scènes principales.', 'Idéal pour donner de la texture aux quartiers.', 'Permet de créer des conséquences et des rumeurs en ville.'],
    chapters: ['Rencontres de rue', 'Quartiers et ambiance', 'Complications urbaines', 'PNJ et événements'],
  },
  'D&D 5 - Les Héros de la Porte de Baldur.pdf': {
    title: 'Les Héros de la Porte de Baldur',
    levels: 'Bas niveau',
    setting: 'Porte de Baldur',
    synopsis: 'Aventure urbaine à la Porte de Baldur, centrée sur les tensions politiques, la criminalité et les choix moraux dans une cité dangereuse.',
    hooks: ['Les personnages sont pris dans les jeux de pouvoir de la cité.', 'La ville elle-même devient le donjon.', 'Les factions locales transforment chaque victoire en compromis.'],
    chapters: ['La Porte de Baldur', 'Factions', 'Intrigues urbaines', 'Scènes et lieux clés', 'Conclusion'],
  },
  'Par-delà le Carnaval de Sorcelume.pdf': {
    title: 'Par-delà le Carnaval de Sorcelume',
    levels: '1-8',
    setting: 'Féerie / Prismeer',
    synopsis: 'Une campagne féerique qui commence au Carnaval de Sorcelume avant d’ouvrir un passage vers Prismeer, domaine brisé de Zybilna. Les aventuriers traversent Céans, Çà-et-là et Par-delà pour comprendre l’emprise des guenaudes, rejoindre le Palais du Désir ardent et libérer ce qui a été figé par le Chaudron d’Iggwilv.',
    hooks: ['Choses perdues : retrouver ce qui a été volé au Carnaval de Sorcelume.', 'La quête de l’occultiste : Madryck Roslof envoie les héros chercher Zybilna.', 'Le passage par la Galerie des illusions révèle la route vers Prismeer.', 'Les choix faits au Carnaval de Sorcelume reviennent dans Céans, Çà-et-là et Par-delà.'],
    chapters: ['Introduction : Au cœur de la Féerie', 'Chapitre 1 : Le Carnaval de Sorcelume', 'Chapitre 2 : Céans', 'Chapitre 3 : Çà-et-là', 'Chapitre 4 : Par-delà', 'Chapitre 5 : Le palais du Désir ardent', 'Annexe A : Objets magiques', 'Annexe B : Factions', 'Annexe C : Créatures', 'Annexes D-E : Interprétation, répliques et suivi'],
  },
};

const NAMED_NPC_GROUPS = [
  {
    test: /Strahd/i,
    campaign: 'La Malédiction de Strahd',
    entries: [
      ['Strahd von Zarovich', 'Seigneur vampire de Barovie', ['STRAHD VON ZAROVICH'], 20],
      ['Ireena Kolyana', 'Protégée de Barovie liée à Tatyana', ['IREENA KOLYANA'], 7],
      ['Ismark Kolyanovich', 'Héritier du bourgmestre de Barovie', ['ISMARK KOLYANOVICH'], 7],
      ['Madame Éva', 'Voyante vistani et tireuse de Tarokka', ['MADAME ÉVA', 'MADAM EVA'], 10],
      ['Rudolph van Richten', 'Chasseur de monstres sous couverture', ['RUDOLPH VAN RICHTEN', 'VAN RICHTEN'], 20],
      ['Esméralda d’Avenir', 'Chasseuse de monstres vistani', ['ESMÉRALDA D’AVENIR', "ESMÉRALDA D'AVENIR", 'ESMERALDA D’AVENIR', "ESMERALDA D'AVENIR", 'EZMERELDA'], 7],
      ['Rahadin', 'Chambellan de Strahd', ['RAHADIN'], 40],
      ['Baba Lysaga', 'Sorcière protectrice de Strahd', ['BABA LYSAGA'], 150],
      ['Mordenkainen', 'Archimage égaré en Barovie', ['MORDENKAINEN'], 35],
      ['Davian Martikov', 'Patriarche des Martikov', ['DAVIAN MARTIKOV'], 160],
      ['Urwin Martikov', 'Aubergiste de Vallaki', ['URWIN MARTIKOV'], 95],
      ['Baron Vargas Vallakovich', 'Bourgmestre de Vallaki', ['BARON VARGAS VALLAKOVICH', 'VARGAS VALLAKOVICH'], 95],
      ['Dame Fiona Wachter', 'Noble conspiratrice de Vallaki', ['FIONA WACHTER'], 95],
      ['Izek Strazni', 'Bras armé du baron Vallakovich', ['IZEK STRAZNI'], 95],
      ['Victor Vallakovich', 'Fils mage du baron Vallakovich', ['VICTOR VALLAKOVICH'], 95],
      ['Rictavio', 'Conteur itinérant de Vallaki', ['RICTAVIO'], 95],
      ['Arabelle', 'Enfant vistani douée de prescience', ['ARABELLE'], 80],
      ['Arrigal', 'Assassin vistani', ['ARRIGAL'], 30],
      ['Luvash', 'Chef vistani', ['LUVASH'], 30],
      ['Kasimir Velikov', 'Elfe du crépuscule hanté par Patrina', ['KASIMIR VELIKOV'], 110],
      ['Patrina Velikovna', 'Archimage elfe du crépuscule', ['PATRINA VELIKOVNA'], 80],
      ['Vladimir Gaardecorne', 'Revenant d’Argynvostholt', ['VLADIMIR GAARDECORNE', 'VLADIMIR HORNGAA'], 120],
      ['Sir Godfrey Gwilym', 'Chevalier revenant d’Argynvostholt', ['GODFREY GWILYM'], 120],
      ['L’Abbé', 'Dirigeant de l’abbaye Sainte-Markovia', ['L’ABBÉ', "L'ABBÉ", 'THE ABBOT'], 140],
      ['Kiril Stoyanovich', 'Chef des loups-garous', ['KIRIL STOYANOVICH'], 200],
      ['Emil Toranescu', 'Loup-garou emprisonné', ['EMIL TORANESCU'], 80],
      ['Zuleika Toranescu', 'Loups-garou opposée à Kiril', ['ZULEIKA TORANESCU'], 200],
      ['Exethanter', 'Liche amnésique du temple d’Ambre', ['EXETHANTER'], 180],
      ['Sergei von Zarovich', 'Frère de Strahd et amour de Tatyana', ['SERGEI VON ZAROVICH', 'SERGEI'], 7],
    ],
  },
  {
    test: /Annihilation/i,
    campaign: 'La Tombe de l’Annihilation',
    entries: [
      ['Syndra Sylvaine', 'Commanditaire de l’expédition', ['SYNDRA SYLVAINE', 'SYNDRA SILVANE'], 5],
      ['Wakanga O’tamu', 'Prince marchand et arcaniste', ['WAKANGA O’TAMU', "WAKANGA O'TAMU"], 15],
      ['Jessamine', 'Prince marchand assassin', ['JESSAMINE'], 15],
      ['Jobal', 'Prince marchand des guides', ['JOBAL'], 15],
      ['Kwayothé', 'Prince marchand ambitieuse', ['KWAYOTHÉ', 'KWAYOTHE'], 15],
      ['Ekene-Afa', 'Prince marchand des armes', ['EKENE-AFA'], 15],
      ['Ifan Talro’a', 'Prince marchand des bêtes', ['IFAN TALRO’A', "IFAN TALRO'A"], 15],
      ['Zhanthi', 'Prince marchand et noble de Port Nyanzaru', ['ZHANTHI'], 15],
      ['Grand-père Zitembe', 'Prêtre de Savras', ['GRAND-PÈRE ZITEMBE', 'ZITEMBE'], 15],
      ['Artus Cimber', 'Explorateur porteur de l’Anneau de l’Hiver', ['ARTUS CIMBER'], 30],
      ['Chair-à-dragon', 'Compagnon saurial d’Artus', ['CHAIR-À-DRAGON', 'DRAGONBAIT'], 30],
      ['Valindra Shadowmantle', 'Liche rouge de Thay', ['VALINDRA SHADOWMANTLE'], 50],
      ['Acererak', 'Liche créatrice du tombeau', ['ACERERAK'], 5],
      ['Ras Nsi', 'Seigneur yuan-ti déchu', ['RAS NSI'], 80],
      ['Fenthaza', 'Prêtresse yuan-ti rivale de Ras Nsi', ['FENTHAZA'], 80],
      ['Salida', 'Guide yuan-ti infiltrée', ['SALIDA'], 20],
      ['Azaka Stormfang', 'Guide chultaise', ['AZAKA STORMFANG'], 20],
      ['Eku', 'Guide mystérieuse et bienveillante', ['EKU'], 20],
      ['Faroul', 'Guide imprudent', ['FAROUL'], 20],
      ['Gondolo', 'Guide imprudent', ['GONDOLO'], 20],
      ['Hew Hackinstone', 'Guide nain vengeur', ['HEW HACKINSTONE'], 20],
      ['Musharib', 'Guide albinos nain', ['MUSHARIB'], 20],
      ['Qawasha', 'Guide druide', ['QAWASHA'], 20],
      ['Shago', 'Guide gladiateur', ['SHAGO'], 20],
      ['Xandala', 'Ensorceleuse cherchant Artus', ['XANDALA'], 20],
      ['Nanny Pu’pu', 'Guenaude de Mbala', ['NANNY PU’PU', "NANNY PU'PU"], 60],
      ['Liara Portyr', 'Commandante du Fort Beluarian', ['LIARA PORTYR'], 40],
      ['Zindar', 'Demi-dragon responsable du port', ['ZINDAR'], 15],
      ['Orvex Ocrammas', 'Scribe survivant de l’expédition', ['ORVEX OCRAMMAS'], 95],
      ['Bag of Nails', 'Chasseur tabaxi', ['BAG OF NAILS'], 95],
    ],
  },
  {
    test: /Waterdeep - Le Vol/i,
    campaign: 'Waterdeep : Le Vol des Dragons',
    entries: [
      ['Volothamp Geddarm', 'Auteur et commanditaire', ['VOLOTHAMP GEDDARM', 'VOLO'], 8],
      ['Renaer Neverember', 'Noble impliqué dans l’enquête', ['RENAER NEVEREMBER'], 8],
      ['Floon Blagmaar', 'Ami disparu de Volo', ['FLOON BLAGMAAR'], 8],
      ['Laeral Silverhand', 'Seigneur manifeste de Waterdeep', ['LAERAL SILVERHAND'], 10],
      ['Vajra Safahr', 'Bâton Noir de Waterdeep', ['VAJRA SAFAHR'], 10],
      ['Jarlaxle Baenre', 'Capitaine drow et antagoniste possible', ['JARLAXLE BAENRE'], 10],
      ['Xanathar', 'Seigneur criminel tyrannœil', ['XANATHAR'], 10],
      ['Manshoon', 'Archimage clone et antagoniste possible', ['MANSHOON'], 10],
      ['Victoro Cassalanter', 'Noble diaboliste', ['VICTORO CASSALANTER'], 10],
      ['Ammalia Cassalanter', 'Noble diaboliste', ['AMMALIA CASSALANTER'], 10],
      ['Davil Starsong', 'Représentant du Zhentarim', ['DAVIL STARSONG'], 12],
      ['Yagra Stonefist', 'Mercenaire demi-orque', ['YAGRA STONEFIST'], 8],
      ['Durnan', 'Propriétaire du Portail Béant', ['DURNAN'], 8],
      ['Mirt', 'Contact des Ménestrels', ['MIRT'], 12],
      ['Jalester Silvermane', 'Agent de l’Alliance des Seigneurs', ['JALESTER SILVERMANE'], 12],
      ['Meloon Wardragon', 'Aventurier lié à Force Grise', ['MELOON WARDRAGON'], 12],
      ['Nihiloor', 'Flagelleur mental du Xanathar', ['NIHILOOR'], 20],
      ['Urstul Floxin', 'Agent violent du Zhentarim', ['URSTUL FLOXIN'], 20],
      ['Barnibus Blastwind', 'Enquêteur de la garde', ['BARNIBUS BLASTWIND'], 30],
      ['Saeth Cromley', 'Sergent de la garde', ['SAETH CROMLEY'], 30],
      ['Vincent Trench', 'Détective privé', ['VINCENT TRENCH'], 20],
      ['Fala Lefaliir', 'Apothicaire du quartier', ['FALA LEFALIIR'], 20],
      ['Tally Fellbranch', 'Menuisier du quartier', ['TALLY FELLBRANCH'], 20],
      ['Lif', 'Esprit de l’Allée du Crâne-de-Troll', ['LIF'], 20],
    ],
  },
  {
    test: /Donjon du Mage/i,
    campaign: 'Waterdeep : Le Donjon du Mage Dément',
    entries: [
      ['Halaster Sombrecape', 'Mage dément de Montprofond', ['HALASTER SOMBRECAPE', 'HALASTER BLACKCLOAK', 'HALASTER'], 5],
      ['Durnan', 'Gardien du Portail Béant', ['DURNAN'], 5],
      ['Jhesiyra Kestellharp', 'Ancienne apprentie de Halaster', ['JHESIYRA KESTELLHARP'], 5],
      ['Trobriand', 'Apprenti de Halaster', ['TROBRIAND'], 5],
      ['Arcturia', 'Apprentie de Halaster', ['ARCTURIA'], 5],
      ['Muiral', 'Apprenti monstrueux de Halaster', ['MUIRAL'], 5],
      ['Maddgoth', 'Mage collectionneur', ['MADDGOTH'], 5],
      ['Wyllow', 'Archidruidesse de Montprofond', ['WYLLOW'], 5],
      ['Fazrian', 'Planétar déchu', ['FAZRIAN'], 5],
      ['Ezzat', 'Liche de Montprofond', ['EZZAT'], 5],
      ['Vlonwelv Auvryndar', 'Matriarche drow', ['VLONWELV AUVRYNDAR'], 5],
      ['T’rissa Auvryndar', 'Prêtresse drow', ['T’RISSA AUVRYNDAR', "T'RISSA AUVRYNDAR"], 5],
    ],
  },
  {
    test: /Reine Dragon/i,
    campaign: 'Le Trésor de la Reine Dragon',
    entries: [
      ['Tarbaw CôteauNoir', 'Gouverneur de Verdure', ['TARBAW CÔTEAUNOIR', 'TARBAW COTEAUNOIR', 'CÔTEAUNOIR', 'COTEAUNOIR'], 5],
      ['Escobert le Rouge', 'Châtelain nain de Greenest', ['ESCOBERT LE ROUGE', 'ESCOBERT'], 5],
      ['Leosin Erlanthar', 'Moine enquêteur des Ménestrels', ['LEOSIN ERLANTHAR'], 5],
      ['Ontharr Frume', 'Paladin de l’Ordre du Gantelet', ['ONTHARR FRUME'], 20],
      ['Rezmir', 'Wyrmspeaker noire', ['REZMIR'], 5],
      ['Frulam Mondath', 'Prêtresse du Culte du Dragon', ['FRULAM MONDATH'], 5],
      ['Langdedrosa Cyanwrath', 'Champion demi-dragon', ['LANGDEDROSA CYANWRATH', 'CYANWRATH'], 5],
      ['Talis la Blanche', 'Wyrmspeaker blanche rivale', ['TALIS LA BLANCHE', 'TALIS'], 40],
      ['Jamna Gleamsilver', 'Agent zhentarim', ['JAMNA GLEAMSILVER'], 30],
      ['Azbara Jos', 'Mage rouge allié au culte', ['AZBARA JOS'], 30],
      ['Rath Modar', 'Mage rouge du Thay', ['RATH MODAR'], 60],
      ['Blagothkus', 'Géant des nuages du château', ['BLAGOTHKUS'], 60],
      ['Severin', 'Chef du Culte du Dragon', ['SEVERIN'], 5],
    ],
  },
  {
    test: /Tonnerre/i,
    campaign: 'Le Tonnerre du Roi des Tempêtes',
    entries: [
      ['Harshnag', 'Géant du givre allié aux aventuriers', ['HARSHNAG'], 5],
      ['Zephyros', 'Géant des nuages excentrique', ['ZEPHYROS'], 5],
      ['Iymrith', 'Dragonne bleue conspiratrice', ['IYMRITH'], 5],
      ['Roi Hekaton', 'Roi des géants des tempêtes', ['ROI HEKATON', 'HEKATON'], 5],
      ['Princesse Serissa', 'Héritière des géants des tempêtes', ['PRINCESSE SERISSA', 'SERISSA'], 5],
      ['Mirran', 'Princesse géante des tempêtes', ['MIRRAN'], 5],
      ['Nym', 'Princesse géante des tempêtes', ['NYM'], 5],
      ['Uthor', 'Oncle et conseiller de Serissa', ['UTHOR'], 5],
      ['Sansuri', 'Comtesse géante des nuages', ['SANSURI'], 5],
      ['Duke Zalto', 'Seigneur géant du feu', ['DUKE ZALTO', 'ZALTO'], 5],
      ['Chef Guh', 'Chef des géants des collines', ['CHEF GUH', 'GUH'], 5],
      ['Kayalithica', 'Thane des géants de pierre', ['KAYALITHICA'], 5],
      ['Slarkrethel', 'Kraken manipulateur', ['SLARKRETHEL'], 5],
      ['Klauth', 'Dragon rouge ancien', ['KLAUTH'], 5],
      ['Felgolos', 'Dragon de bronze amical', ['FELGOLOS'], 5],
    ],
  },
  {
    test: /Baldur/i,
    campaign: 'Les Héros de la Porte de Baldur',
    entries: [
      ['Coran', 'Roublard elfe aventurier', ['CORAN'], 4],
      ['Dynaheir', 'Sorcière rashemi et alliée des Ménestrels', ['DYNAHEIR'], 4],
      ['Imoen', 'Voleuse, apprentie mage et espionne des Ménestrels', ['IMOEN'], 4],
      ['Jaheira', 'Druide demi-elfe des Ménestrels', ['JAHEIRA'], 4],
      ['Khalid', 'Combattant demi-elfe et époux de Jaheira', ['KHALID'], 4],
      ['Minsc', 'Berserker rashemi et garde du corps', ['MINSC'], 4],
      ['Xan', 'Sorcier elfe pessimiste porteur d’une lame de lune', ['XAN'], 4],
      ['Edwin', 'Sorcier Rouge de Thay manipulateur', ['EDWIN'], 4],
      ['Faldorn', 'Druide de l’ombre', ['FALDORN'], 4],
      ['Kagain', 'Mercenaire nain du Zhentarim', ['KAGAIN'], 4],
      ['Kivan', 'Rôdeur elfe taciturne', ['KIVAN'], 4],
      ['Montaron', 'Assassin halfelin du Zhentarim', ['MONTARON'], 4],
      ['Viconia', 'Prêtresse drow exilée', ['VICONIA'], 4],
      ['Xzar', 'Nécromancien instable', ['XZAR'], 4],
      ['Duke Belt', 'Grand duc et ancien aventurier', ['DUKE BELT'], 4],
      ['Duke Eltan', 'Fondateur du Poing Enflammé', ['DUKE ELTAN'], 4],
      ['Duke Entar Ecudargent', 'Grand duc riche et influent', ['DUKE ENTAR ECUDARGENT', 'ENTAR ECUDARGENT'], 4],
      ['Duchess Liia Jannath', 'Grande duchesse divinatrice', ['DUCHESS LIIA JANNATH', 'LIIA JANNATH'], 4],
      ['Gorion', 'Sage ménestrel de Château-Suif', ['GORION'], 4],
      ['Pupille de Gorion', 'Orphelin rejeton de Bhaal', ['PUPILLE DE GORION'], 4],
      ['Sarevok Anchev', 'Rejeton de Bhaal et chef du Trône de Fer', ['SAREVOK ANCHEV'], 4],
      ['Rotter Eve', 'Guenaude de Bois-Manteau', ['ROTTER EVE'], 4],
      ['Babbling Fen', 'Guenaude de la rivière Chionthar', ['BABBLING FEN'], 4],
      ['Della Souffle de crapaud', 'Guenaude collectionneuse de recettes', ['DELLA SOUFFLE DE CRAPAUD'], 4],
    ],
  },
  {
    test: /Sorcelume|Carnaval/i,
    campaign: 'Par-delà le Carnaval de Sorcelume',
    entries: [
      ['Monsieur Sorcière', 'Propriétaire shadar-kaï du Carnaval de Sorcelume', ['MONSIEUR SORCIÈRE', 'SORCIÈRE ET LUMIÈRE'], 24],
      ['Monsieur Lumière', 'Propriétaire shadar-kaï du Carnaval de Sorcelume', ['MONSIEUR LUMIÈRE', 'SORCIÈRE ET LUMIÈRE'], 24],
      ['Zybilna', 'Archifée figée au Palais du Désir ardent', ['ZYBILNA'], 5],
      ['Iggwilv', 'Reine Sorcière liée à Zybilna et au Chaudron d’Iggwilv', ['IGGWILV', 'D’IGGWILV', "D'IGGWILV"], 5],
      ['Madryck Roslof', 'Occultiste qui demande de retrouver Zybilna', ['MADRYCK ROSLOF', 'MADRYCK'], 10],
      ['Bavlorna Paillepourrie', 'Guenaude de l’assemblée du Sablier qui règne sur Céans', ['BAVLORNA PAILLEPOURRIE', 'BAVLORNA'], 58],
      ['Skabatha Belladone', 'Guenaude de l’assemblée du Sablier qui règne sur Çà-et-là', ['SKABATHA BELLADONE', 'MÈRE-GRAND BELLADONE', 'SKABATHA'], 100],
      ['Endelyne Tombelune', 'Guenaude de l’assemblée du Sablier qui règne sur Par-delà', ['ENDELYNE TOMBELUNE', 'ENDELYNE'], 134],
      ['Nikolas', 'Gobelin guichetier du Carnaval de Sorcelume', ['INTERPRÉTER NIKOLAS', 'NIKOLAS'], 32],
      ['Rubin Sucreboise', 'Halfelin disparu dans la Galerie des illusions', ['RUBIN SUCREBOISE'], 37],
      ['Piedecire', 'Mime du Carnaval de Sorcelume privé de sa voix', ['PIEDECIRE'], 37],
      ['Palasha', 'Sirène du lac Hymnargent au Carnaval de Sorcelume', ['PALASHA'], 39],
      ['Plumevienne', 'Causeur aérien du Carnaval de Sorcelume', ['PLUMEVIENNE'], 39],
      ['Bohu', 'Gobelours du Coin des forains', ['BOHU'], 33],
      ['Tohu', 'Frère disparu de Bohu', ['TOHU'], 33],
      ['Diane Trottinard', 'Responsable du manège du Carnaval de Sorcelume', ['DIANE TROTTINARD'], 41],
      ['Zéphixo', 'Créateur nain de la Mine des mystères', ['ZÉPHIXO', 'ZEPHIXO'], 43],
      ['Dirlagraun', 'Bête éclipsante qui veille sur les enfants égarés', ['DIRLAGRAUN'], 44],
      ['Viro', 'Enfant égaré surveillé par Dirlagraun', ['VIRO'], 44],
      ['Allowin', 'Enfant égaré surveillé par Dirlagraun', ['ALLOWIN'], 44],
      ['La Bouilloire', 'Kenku occultiste infiltrée au Carnaval de Sorcelume', ['LA BOUILLOIRE', 'BOUILLOIRE'], 41],
      ['Biscuit', 'Gardien du Royaume des pixies', ['BISCUIT'], 48],
      ['Menthaumiel', 'Pixie arbitre du Royaume des pixies', ['MENTHAUMIEL'], 49],
      ['Coccinétoile', 'Pixie traqueuse du Royaume des pixies', ['COCCINÉTOILE', 'COCCINETOILE'], 49],
      ['Ellywick Grattechambard', 'Gnome qui aide les héros au Carnaval de Sorcelume', ['ELLYWICK GRATTECHAMBARD', 'ELLYWICK'], 50],
      ['Thaco', 'Clown grincheux du Carnaval de Sorcelume', ['THACO'], 50],
      ['Cochontruie', 'Goule larronne de l’assemblée du Sablier', ['COCHONTRUIE'], 50],
      ['Messire Talavar', 'Dragon féerique prisonnier près de la Tour penchée', ['MESSIRE TALAVAR', 'TALAVAR'], 69],
      ['Bling-bling', 'Gobeline collectionneuse de clefs liée à la Colline Télémie', ['BLING-BLING'], 71],
      ['Agdon Longchâle', 'Chef brigand conil de Céans', ['AGDON LONGCHÂLE', 'AGDON'], 69],
      ['Morgort', 'Ancienne chevalière brutacienne de Céans', ['MORGORT'], 78],
      ['Gullop XIX', 'Roi brutacien de la Cour aux miasmes', ['GULLOP XIX', 'GULLOP'], 80],
      ['Griffepince', 'Épouvantail de Céans', ['GRIFFEPINCE'], 78],
      ['Octavian', 'Elfe flûtiste maudit à Céans', ['OCTAVIAN'], 85],
      ['Charme', 'Larronne liée à l’assemblée du Sablier', ['CHARME'], 95],
      ['Will de Féerie', 'Chef du gang des Fugueurs dans Çà-et-là', ['WILL DE FÉERIE', 'WILL'], 108],
      ['Lamorna', 'Licorne qui protège le Lac Indocile', ['LAMORNA'], 110],
      ['Élidon', 'Compagnon licorne de Lamorna', ['ÉLIDON', 'ELIDON'], 110],
      ['Miroite', 'Ombre autonome croisée dans Par-delà', ['MIROITE'], 134],
      ['Amidor', 'Pissenlit chevalier de Par-delà', ['AMIDOR'], 134],
      ['Pollenella', 'Abeille géante alliée d’Amidor', ['POLLENELLA'], 135],
      ['Alagarthas', 'Prince elfe maudit aux Phares féeriques', ['ALAGARTHAS'], 142],
      ['Obud', 'Brigganock gardien des pierres de vœu', ['OBUD'], 146],
      ['Molliver', 'Membre de l’Appel des vaillants à la mine brigganock', ['MOLLIVER'], 146],
      ['Cœur-vaillant', 'Paladin fondateur de l’Appel des vaillants', ['CŒUR-VAILLANT', 'COEUR-VAILLANT'], 216],
      ['Mercion', 'Membre de l’Appel des vaillants', ['MERCION'], 216],
      ['Ringlerun', 'Membre de l’Appel des vaillants', ['RINGLERUN'], 216],
      ['Affreduche', 'Membre de la Ligue de la Haine', ['AFFREDUCHE'], 220],
      ['Kelek', 'Membre de la Ligue de la Haine', ['KELEK'], 220],
      ['Skylla', 'Membre de la Ligue de la Haine', ['SKYLLA'], 220],
      ['Zarak', 'Membre de la Ligue de la Haine', ['ZARAK'], 220],
      ['Zargash', 'Membre de la Ligue de la Haine', ['ZARGASH'], 220],
    ],
  },
];

const KNOWN_NAMED_NPC_KEYS = new Set(
  NAMED_NPC_GROUPS.flatMap((group) => group.entries.map(([name]) => normalizeName(canonicalNpcName(name)))),
);

const CORE_AIDEDD_NPC_PROFILE_KEYS = new Set([
  'acolyte',
  'archimage',
  'assassin',
  'bandit',
  'bandit-capitaine',
  'berserk',
  'chevalier',
  'cultiste',
  'druide',
  'eclaireur',
  'espion',
  'fanatique',
  'garde',
  'gladiateur',
  'guerrier-tribal',
  'homme-du-peuple',
  'mage',
  'noble',
  'pretre',
  'truand',
  'veteran',
]);

const STANDARD_ARMORS = [
  { name: 'Armure matelassée', armorCategory: 'Légère', ac: '11 + mod. Dex', strength: '', stealth: 'Désavantage', weight: '4 kg', price: '5 po' },
  { name: 'Armure de cuir', armorCategory: 'Légère', ac: '11 + mod. Dex', strength: '', stealth: '', weight: '5 kg', price: '10 po' },
  { name: 'Armure de cuir cloutée', armorCategory: 'Légère', ac: '12 + mod. Dex', strength: '', stealth: '', weight: '6,5 kg', price: '45 po' },
  { name: 'Armure de peau', armorCategory: 'Intermédiaire', ac: '12 + mod. Dex (max +2)', strength: '', stealth: '', weight: '6 kg', price: '10 po' },
  { name: 'Chemise de mailles', armorCategory: 'Intermédiaire', ac: '13 + mod. Dex (max +2)', strength: '', stealth: '', weight: '10 kg', price: '50 po' },
  { name: 'Armure d’écailles', armorCategory: 'Intermédiaire', ac: '14 + mod. Dex (max +2)', strength: '', stealth: 'Désavantage', weight: '22,5 kg', price: '50 po' },
  { name: 'Cuirasse', armorCategory: 'Intermédiaire', ac: '14 + mod. Dex (max +2)', strength: '', stealth: '', weight: '10 kg', price: '400 po' },
  { name: 'Demi-plate', armorCategory: 'Intermédiaire', ac: '15 + mod. Dex (max +2)', strength: '', stealth: 'Désavantage', weight: '20 kg', price: '750 po' },
  { name: 'Broigne', armorCategory: 'Lourde', ac: '14', strength: '', stealth: 'Désavantage', weight: '20 kg', price: '30 po' },
  { name: 'Cotte de mailles', armorCategory: 'Lourde', ac: '16', strength: 'For 13', stealth: 'Désavantage', weight: '27,5 kg', price: '75 po' },
  { name: 'Clibanion', armorCategory: 'Lourde', ac: '17', strength: 'For 15', stealth: 'Désavantage', weight: '30 kg', price: '200 po' },
  { name: 'Harnois', armorCategory: 'Lourde', ac: '18', strength: 'For 15', stealth: 'Désavantage', weight: '32,5 kg', price: '1500 po' },
  { name: 'Bouclier', armorCategory: 'Bouclier', ac: '+2', strength: '', stealth: '', weight: '3 kg', price: '10 po' },
];

const STANDARD_EQUIPMENT = [
  ['Abri', 'Équipement d’aventurier', '2 po', '10 kg'],
  ['Acide (fiole)', 'Équipement d’aventurier', '25 po', '500 g'],
  ['Bâton', 'Équipement d’aventurier', '2 pc', '2 kg'],
  ['Bélier portable', 'Équipement d’aventurier', '4 po', '17,5 kg'],
  ['Billes (sac de 1 000)', 'Équipement d’aventurier', '1 po', '1 kg'],
  ['Boîte à amadou', 'Équipement d’aventurier', '5 pa', '500 g'],
  ['Boîte pour cartes ou parchemins', 'Équipement d’aventurier', '1 po', '500 g'],
  ['Bougie', 'Équipement d’aventurier', '1 pc', ''],
  ['Bourse', 'Équipement d’aventurier', '5 pa', '500 g'],
  ['Bouteille en verre', 'Équipement d’aventurier', '2 po', '1 kg'],
  ['Cadenas', 'Équipement d’aventurier', '10 po', '500 g'],
  ['Carquois', 'Équipement d’aventurier', '1 po', '500 g'],
  ['Chaîne (3 m)', 'Équipement d’aventurier', '5 po', '5 kg'],
  ['Chausse-trappes (sac de 20)', 'Équipement d’aventurier', '1 po', '1 kg'],
  ['Chevalière', 'Équipement d’aventurier', '5 po', ''],
  ['Clochette', 'Équipement d’aventurier', '1 po', ''],
  ['Corde de chanvre (15 m)', 'Équipement d’aventurier', '1 po', '5 kg'],
  ['Corde de soie (15 m)', 'Équipement d’aventurier', '10 po', '2,5 kg'],
  ['Couverture', 'Équipement d’aventurier', '5 pa', '1,5 kg'],
  ['Craie', 'Équipement d’aventurier', '1 pc', ''],
  ['Eau bénite (flasque)', 'Équipement d’aventurier', '25 po', '500 g'],
  ['Échelle (3 m)', 'Équipement d’aventurier', '1 pa', '12,5 kg'],
  ['Encre (fiole)', 'Équipement d’aventurier', '10 po', ''],
  ['Étui à carreaux', 'Équipement d’aventurier', '1 po', '500 g'],
  ['Fiole', 'Équipement d’aventurier', '1 po', ''],
  ['Flasque ou chope', 'Équipement d’aventurier', '2 pc', '500 g'],
  ['Grappin', 'Équipement d’aventurier', '2 po', '2 kg'],
  ['Hameçon', 'Équipement d’aventurier', '1 pc', ''],
  ['Huile (flasque)', 'Équipement d’aventurier', '1 pa', '500 g'],
  ['Lampe', 'Équipement d’aventurier', '5 pa', '500 g'],
  ['Lanterne à capote', 'Équipement d’aventurier', '5 po', '1 kg'],
  ['Lanterne sourde', 'Équipement d’aventurier', '10 po', '1 kg'],
  ['Livre', 'Équipement d’aventurier', '25 po', '2,5 kg'],
  ['Longue-vue', 'Équipement d’aventurier', '1000 po', '500 g'],
  ['Marteau', 'Équipement d’aventurier', '1 po', '1,5 kg'],
  ['Menottes', 'Équipement d’aventurier', '2 po', '3 kg'],
  ['Miroir en acier', 'Équipement d’aventurier', '5 po', '250 g'],
  ['Papier (feuille)', 'Équipement d’aventurier', '2 pa', ''],
  ['Parchemin (feuille)', 'Équipement d’aventurier', '1 pa', ''],
  ['Parfum (fiole)', 'Équipement d’aventurier', '5 po', ''],
  ['Panier', 'Équipement d’aventurier', '4 pa', '1 kg'],
  ['Pelle', 'Équipement d’aventurier', '2 po', '2,5 kg'],
  ['Perche (3 m)', 'Équipement d’aventurier', '5 pc', '3,5 kg'],
  ['Pied-de-biche', 'Équipement d’aventurier', '2 po', '2,5 kg'],
  ['Piège à mâchoires', 'Équipement d’aventurier', '5 po', '12,5 kg'],
  ['Piton', 'Équipement d’aventurier', '5 pc', '125 g'],
  ['Potion de soins', 'Potion', '50 po', '250 g'],
  ['Rations (1 jour)', 'Équipement d’aventurier', '5 pa', '1 kg'],
  ['Sac', 'Équipement d’aventurier', '1 pc', '250 g'],
  ['Sac à dos', 'Équipement d’aventurier', '2 po', '2,5 kg'],
  ['Sac de couchage', 'Équipement d’aventurier', '1 po', '3,5 kg'],
  ['Sacoche', 'Équipement d’aventurier', '5 pa', '500 g'],
  ['Savon', 'Équipement d’aventurier', '2 pc', ''],
  ['Seau', 'Équipement d’aventurier', '5 pc', '1 kg'],
  ['Sifflet', 'Équipement d’aventurier', '5 pc', ''],
  ['Symbole sacré', 'Focaliseur', '5 po', '500 g'],
  ['Tente pour deux personnes', 'Équipement d’aventurier', '2 po', '10 kg'],
  ['Torche', 'Équipement d’aventurier', '1 pc', '500 g'],
].map(([name, type, price, weight]) => ({ name, type, price, weight }));

const SOURCE_TYPES = [
  [/Manuel des monstres/i, 'Compendium'],
  [/AideDD\.org - (Animaux|Monstres|PNJ)/i, 'Compendium'],
  [/Compendium Monstrueux/i, 'Compendium'],
  [/Reine Dragon|Strahd|Annihilation|Tempêtes|Waterdeep|Baldur|Sorcelume|Carnaval|Prismeer/i, 'Campagne'],
  [/Manuel|Guide|Xanathar|Basic Rules|Races et Classes|Côte des Épées/i, 'Règles'],
];

const entitiesByKey = new Map();
const qualityByKey = new Map();
const campaignEntityIds = new Map();
const animalNameKeys = new Set();

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(COVER_DIR, { recursive: true });
  await rm(path.join(COVER_DIR, 'test-monstres.png'), { recursive: true, force: true });

  const files = (await readdir(INFO_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort((a, b) => a.localeCompare(b, 'fr'));
  const versionHash = createHash('sha256');
  versionHash.update(await readFile(fileURLToPath(import.meta.url), 'utf8'));
  for (const file of files) {
    const s = await stat(path.join(INFO_DIR, file));
    versionHash.update(`${file}:${s.size}:${Math.trunc(s.mtimeMs)}\n`);
    const ocrPath = pdfOcrPath(file);
    if (existsSync(ocrPath)) {
      const ocrStat = await stat(ocrPath);
      versionHash.update(`ocr:${file}:${ocrStat.size}:${Math.trunc(ocrStat.mtimeMs)}\n`);
    }
  }
  const version = `info-dnd-${versionHash.digest('hex').slice(0, 16)}`;

  for (const file of files) {
    const abs = path.join(INFO_DIR, file);
    const title = titleFromFile(file);
    const ocrTextCache = await readPdfOcrText(file);
    let fullTextCache;
    const getFullText = async (options = {}) => {
      if (fullTextCache === undefined) {
        const nativeText = await readPdfText(abs, options);
        fullTextCache = selectBestPdfText(nativeText, ocrTextCache);
      }
      return fullTextCache;
    };
    const info = await readPdfInfo(abs);
    const coverImage = await renderCover(abs, title);
    const nativeTextSample = await readPdfText(abs, { first: Math.min(info.total || 12, 14) }).catch(() => '');
    const textSample = selectBestPdfText(nativeTextSample, ocrTextCache);
    const toc = extractToc(textSample, info.outline);
    const type = sourceType(file);

    addEntity('sourcebook', title, {
      type,
      sourceFile: file,
      pages: info.total ?? null,
      coverImage,
      tableOfContents: toc.length ? toc.map((x) => `${x.title} p. ${x.page}`).join('\n') : '',
      notes: sourceNotes(file),
    }, `${type} · ${info.total ?? '?'} pages`, [type.toLowerCase(), 'pdf'], title, sourceLicense(file), 90, `sourcebook:${file}`);

    if (CAMPAIGNS[file]) addCampaign(file, CAMPAIGNS[file], coverImage);

    const fullForWeapons = await getFullText({ large: true });
    if (/Basic Rules|Manuel des joueurs/i.test(file)) {
      parseWeaponTables(fullForWeapons, file, title, sourceLicense(file), /Basic Rules/i.test(file) ? 100 : 80);
      parseArmorTables(fullForWeapons, file, title, sourceLicense(file), /Basic Rules/i.test(file) ? 100 : 80);
      parseStandardEquipment(fullForWeapons, file, title, sourceLicense(file), /Basic Rules/i.test(file) ? 100 : 80);
    }
    parseMagicWeapons(fullForWeapons, file, title, sourceLicense(file), weaponScanQuality(file));
    parseRemainingWeaponMentions(fullForWeapons, file, title, sourceLicense(file), weaponScanQuality(file));
    if (shouldParseMagicItemBlocks(file)) {
      parseMagicArmorsAndItems(fullForWeapons, file, title, sourceLicense(file), itemScanQuality(file));
    }
    parseKnownCampaignItems(fullForWeapons, file, title, sourceLicense(file), itemScanQuality(file));
    parseNpcContent(fullForWeapons, file, title, sourceLicense(file), npcScanQuality(file));
    parseCampaignContent(fullForWeapons, file, title, sourceLicense(file), campaignScanQuality(file));

    if (/AideDD\.org - Animaux\.pdf/i.test(file)) {
      const full = await getFullText();
      parseStatBlocks(full, file, title, LICENSE_AIDEDD, 100, {
        categoryKey: 'animal',
        baseTag: 'animal',
      });
      continue;
    }

    if (/AideDD\.org - (Monstres|PNJ)\.pdf/i.test(file)) {
      const full = await getFullText();
      parseStatBlocks(full, file, title, LICENSE_AIDEDD, 100);
      continue;
    }

    if (/Compendium Monstrueux/i.test(file)) {
      const full = await getFullText({ large: true });
      parseStatBlocks(full, file, title, LICENSE_LOCAL, 80);
      continue;
    }

    if (/Manuel des monstres/i.test(file)) {
      const full = await getFullText({ large: true });
      parseMonsterManual(full, file, title, LICENSE_LOCAL, 90);
      continue;
    }

    if (/Basic Rules/i.test(file)) {
      const full = await getFullText();
      parseSpells(full, file, title, 90);
      parseRuleSections(full, file, title, 'Règles de base');
      continue;
    }

    if (/Races et Classes/i.test(file)) {
      const full = await getFullText();
      parsePlayerOptions(full, file, title);
      parseSpells(full, file, title, 70);
      continue;
    }
  }

  pruneMonsterDuplicatesFromAnimals();

  const entities = [...entitiesByKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const payload = {
    version,
    generatedAt: GENERATED_AT,
    sourceFolder: 'info_dnd',
    counts: {
      categories: categories.length,
      entities: entities.length,
      animals: entities.filter((e) => e.categoryId === CAT.animal).length,
      monsters: entities.filter((e) => e.categoryId === CAT.monster).length,
      spells: entities.filter((e) => e.categoryId === CAT.spell).length,
      weapons: entities.filter((e) => e.categoryId === CAT.weapon).length,
      armors: entities.filter((e) => e.categoryId === CAT.armor).length,
      items: entities.filter((e) => e.categoryId === CAT.item).length,
      npcs: entities.filter((e) => e.categoryId === CAT.npc).length,
      campaigns: entities.filter((e) => e.categoryId === CAT.campaign).length,
      adventureSections: entities.filter((e) => e.categoryId === CAT.adventureSection).length,
      locations: entities.filter((e) => e.categoryId === CAT.location).length,
    },
    categories,
    entities,
  };

  await writeFile(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');
  await writeFile(SQL_OUT, buildSql(payload), 'utf8');

  console.log(`✓ ${payload.counts.categories} catégories`);
  console.log(`✓ ${payload.counts.entities} fiches`);
  console.log(`  - ${payload.counts.campaigns} campagnes`);
  console.log(`  - ${payload.counts.animals} animaux`);
  console.log(`  - ${payload.counts.monsters} monstres/blocs de stats`);
  console.log(`  - ${payload.counts.spells} sorts`);
  console.log(`  - ${payload.counts.weapons} armes`);
  console.log(`  - ${payload.counts.armors} armures/boucliers`);
  console.log(`  - ${payload.counts.items} objets/trésors`);
  console.log(`  - ${payload.counts.npcs} PNJ`);
  console.log(`  - ${payload.counts.adventureSections} chapitres/scènes`);
  console.log(`  - ${payload.counts.locations} lieux`);
  console.log(`✓ ${path.relative(ROOT, JSON_OUT)}`);
  console.log(`✓ ${path.relative(ROOT, SQL_OUT)}`);
}

function sourceType(file) {
  for (const [re, type] of SOURCE_TYPES) if (re.test(file)) return type;
  return 'Référence';
}

function sourceLicense(file) {
  return /AideDD/i.test(file) ? LICENSE_AIDEDD : LICENSE_LOCAL;
}

function sourceNotes(file) {
  if (/Compendium Monstrueux/i.test(file)) {
    return 'Compendium non officiel fourni localement. Les entrées sont dédoublonnées avec les fiches AideDD quand un même nom existe.';
  }
  if (/AideDD/i.test(file)) return 'Source communautaire AideDD/SRD, privilégiée pour les blocs de statistiques détaillés.';
  return 'Source locale fournie dans info_dnd. Les fiches générées conservent le fichier et les pages de provenance.';
}

function weaponScanQuality(file) {
  if (/Basic Rules/i.test(file)) return 100;
  if (/Manuel des joueurs/i.test(file)) return 80;
  if (/Guide du mai|Guide du ma|Strahd/i.test(file)) return 85;
  if (/Xanathar|Reine Dragon|Annihilation|Temp|Waterdeep|Baldur/i.test(file)) return 80;
  if (/Compendium Monstrueux/i.test(file)) return 70;
  return 60;
}

function itemScanQuality(file) {
  if (/Basic Rules/i.test(file)) return 100;
  if (/Manuel des joueurs/i.test(file)) return 80;
  if (/Guide du mai|Guide du ma/i.test(file)) return 95;
  if (/Guide Complet de Xanathar/i.test(file)) return 88;
  if (/Strahd|Annihilation|Waterdeep|Baldur|Reine Dragon|Temp/i.test(file)) return 82;
  return 55;
}

function shouldParseMagicItemBlocks(file) {
  return /Guide du mai|Guide du ma|Guide Complet de Xanathar/i.test(file);
}

function npcScanQuality(file) {
  if (/AideDD\.org - PNJ/i.test(file)) return 100;
  if (/Strahd|Annihilation|Waterdeep|Baldur|Reine Dragon|Temp|Sorcelume|Carnaval|Prismeer/i.test(file)) return 85;
  if (/Compendium Monstrueux - Personnages/i.test(file)) return 75;
  return 55;
}

function campaignScanQuality(file) {
  if (CAMPAIGNS[file]) return 92;
  return 0;
}

function linkCampaignText(text, meta, sourceFile) {
  if (!text || !meta || !/Sorcelume|Carnaval/i.test(sourceFile)) return text;
  return applyWikiLinks(String(text), campaignLinkTargets(sourceFile, meta));
}

function campaignLinkTargets(sourceFile, meta) {
  const groups = NAMED_NPC_GROUPS.filter((group) => group.test.test(sourceFile));
  const generic = new Set(['Charme']);
  const targets = [
    ...campaignKnownLocationRanges(sourceFile).map((entry) => entry.name),
    ...groups.flatMap((group) => group.entries.map(([name]) => name)),
  ]
    .map((target) => cleanText(target))
    .filter((target) => target.length >= 4 && !generic.has(target));

  return uniqueList(targets).sort((a, b) => b.length - a.length);
}

function applyWikiLinks(text, targets) {
  if (!targets.length) return text;
  return String(text)
    .split(/(\[\[[^\]]+\]\])/g)
    .map((part) => {
      if (part.startsWith('[[')) return part;
      return linkWikiSegment(part, targets);
    })
    .join('');
}

function linkWikiSegment(segment, targets) {
  let out = segment;
  for (const target of targets) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}\\]])(${wikiTargetPattern(target)})(?=$|[^\\p{L}\\p{N}\\[])`, 'giu');
    out = out
      .split(/(\[\[[^\]]+\]\])/g)
      .map((part) => (part.startsWith('[[') ? part : part.replace(re, (_match, prefix) => `${prefix}[[${target}]]`)))
      .join('');
  }
  return out;
}

function wikiTargetPattern(target) {
  return escapeRegExp(target).replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');
}

function addCampaign(file, meta, coverImage) {
  const id = addEntity('campaign', meta.title, {
    coverImage,
    mapImage: '',
    levels: meta.levels,
    setting: meta.setting,
    sourceFile: file,
    synopsis: linkCampaignText(meta.synopsis, meta, file),
    chapters: meta.chapters.map((chapter) => linkCampaignText(chapter, meta, file)),
    hooks: meta.hooks.map((hook) => linkCampaignText(hook, meta, file)),
  }, `${meta.levels} · ${meta.setting}`, ['campagne', meta.setting.toLowerCase()], meta.title, LICENSE_LOCAL, 100, `campaign:${meta.title}`);
  campaignEntityIds.set(meta.title, id);

  meta.chapters.forEach((chapter, index) => {
    addEntity('adventureSection', `${meta.title} — ${chapter}`, {
      campaign: meta.title,
      kind: campaignSectionKind(chapter),
      sourceFile: file,
      pageStart: null,
      pageEnd: null,
      content: `Repère de structure pour [[${meta.title}]]. Consulte le PDF source pour le détail de cette section.`,
    }, meta.title, ['campagne', 'chapitre'], meta.title, LICENSE_LOCAL, 60, `section:${meta.title}:${index}`);
  });
}

function addEntity(categoryKey, name, data, summary, tags, sourceName, license, quality = 50, forcedKey = undefined) {
  const categoryId = CAT[categoryKey];
  const key = forcedKey ?? `${categoryKey}:${normalizeName(name)}`;
  if (entitiesByKey.has(key) && (qualityByKey.get(key) ?? 0) >= quality) return entitiesByKey.get(key).id;

  const id = uuidv5(key, NS);
  const row = {
    id,
    categoryId,
    ownerId: null,
    kind: 'source',
    visibility: 'official',
    parentId: null,
    name: categoryKey === 'npc' ? cleanTitle(name) : displayTitle(name),
    summary: cleanText(summary ?? ''),
    data,
    patch: null,
    tags: [...new Set((tags ?? []).filter(Boolean).map((t) => cleanText(String(t)).toLowerCase()))],
    license,
    sourceName,
    rev: 1,
    isDefaultVariant: false,
    deletedAt: null,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    _syncState: 'synced',
  };
  entitiesByKey.set(key, row);
  qualityByKey.set(key, quality);
  return id;
}

function addNpc(name, data, summary, tags, sourceName, license, quality = 50, forcedKey = undefined) {
  const npcName = canonicalNpcName(name);
  const key = forcedKey ?? `npc:${normalizeName(npcName)}`;
  const incoming = normalizeNpcData(npcName, data, sourceName);
  const normalizedTags = uniqueList((tags ?? []).filter(Boolean).map((t) => cleanText(String(t)).toLowerCase()));

  if (entitiesByKey.has(key)) {
    const existing = entitiesByKey.get(key);
    const existingQuality = qualityByKey.get(key) ?? 0;
    const primary = existingQuality >= quality ? existing.data : incoming;
    const secondary = existingQuality >= quality ? incoming : existing.data;
    existing.data = mergeNpcData(primary, secondary);
    existing.tags = uniqueList([...(existing.tags ?? []), ...normalizedTags]);
    if (!existing.summary && summary) existing.summary = cleanText(summary);
    if (quality > existingQuality) {
      existing.name = cleanTitle(npcName);
      existing.sourceName = sourceName;
      existing.license = license;
      qualityByKey.set(key, quality);
    }
    return existing.id;
  }

  return addEntity('npc', npcName, incoming, summary, normalizedTags, sourceName, license, quality, key);
}

function normalizeNpcData(name, data, sourceName) {
  const out = { ...data };
  out.campaign = cleanText(out.campaign ?? '');
  out.role = cleanText(out.role ?? '');
  out.sourceFile = cleanText(out.sourceFile ?? '');
  out.sourcePage = out.sourcePage ?? null;
  out.description = cleanText(out.description ?? '');
  const source = formatNpcSource(sourceName, out.sourceFile, out.sourcePage);
  out.sources = uniqueList([...(out.sources ?? []), source].filter(Boolean));
  out.aliases = uniqueList([...(out.aliases ?? [])].filter(Boolean));
  if (!out.aliases.includes(name) && canonicalNpcName(name) !== name) out.aliases.push(name);
  return out;
}

function mergeNpcData(primary, secondary) {
  const out = { ...primary };
  for (const [field, value] of Object.entries(secondary ?? {})) {
    if (field === 'sources' || field === 'aliases') continue;
    if ((out[field] == null || out[field] === '' || (Array.isArray(out[field]) && !out[field].length)) && value != null && value !== '') out[field] = value;
  }
  out.sources = uniqueList([...(primary?.sources ?? []), ...(secondary?.sources ?? [])]);
  out.aliases = uniqueList([...(primary?.aliases ?? []), ...(secondary?.aliases ?? [])]);
  return out;
}

function formatNpcSource(sourceName, sourceFile, sourcePage) {
  if (!sourceName && !sourceFile) return '';
  return `${sourceName || sourceFile}${sourcePage ? ` p. ${sourcePage}` : ''}${sourceFile ? ` (${sourceFile})` : ''}`;
}

function addWeapon(name, data, summary, tags, sourceName, license, quality = 50, forcedKey = undefined) {
  const weaponName = canonicalWeaponName(name);
  const key = forcedKey ?? `weapon:${normalizeName(weaponName)}`;
  const incoming = normalizeWeaponData(data);
  const normalizedTags = uniqueList((tags ?? []).filter(Boolean).map((t) => cleanText(String(t)).toLowerCase()));

  if (entitiesByKey.has(key)) {
    const existing = entitiesByKey.get(key);
    const existingQuality = qualityByKey.get(key) ?? 0;
    if (existingQuality >= quality) {
      existing.data = mergeWeaponData(existing.data, incoming);
      existing.tags = uniqueList([...(existing.tags ?? []), ...normalizedTags]);
      if (!existing.summary && summary) existing.summary = cleanText(summary);
      return existing.id;
    }

    incoming.sources = uniqueList([...(incoming.sources ?? []), ...(existing.data?.sources ?? [])]);
    incoming.properties = uniqueList([...(incoming.properties ?? []), ...(existing.data?.properties ?? [])]);
    for (const [field, value] of Object.entries(existing.data ?? {})) {
      if (isBlankWeaponValue(incoming[field]) && !isBlankWeaponValue(value)) incoming[field] = value;
    }
    tags = uniqueList([...normalizedTags, ...(existing.tags ?? [])]);
    entitiesByKey.delete(key);
    qualityByKey.delete(key);
  }

  return addEntity('weapon', weaponName, incoming, summary, tags, sourceName, license, quality, key);
}

function addArmor(name, data, summary, tags, sourceName, license, quality = 50, forcedKey = undefined) {
  const armorName = canonicalArmorName(name);
  const key = forcedKey ?? `armor:${normalizeName(armorName)}`;
  const incoming = normalizeArmorData(data);
  const normalizedTags = uniqueList((tags ?? []).filter(Boolean).map((t) => cleanText(String(t)).toLowerCase()));

  if (entitiesByKey.has(key)) {
    const existing = entitiesByKey.get(key);
    const existingQuality = qualityByKey.get(key) ?? 0;
    if (existingQuality >= quality) {
      existing.data = mergeItemLikeData(existing.data, incoming);
      existing.tags = uniqueList([...(existing.tags ?? []), ...normalizedTags]);
      if (!existing.summary && summary) existing.summary = cleanText(summary);
      return existing.id;
    }

    incoming.sources = uniqueList([...(incoming.sources ?? []), ...(existing.data?.sources ?? [])]);
    for (const [field, value] of Object.entries(existing.data ?? {})) {
      if (isBlankWeaponValue(incoming[field]) && !isBlankWeaponValue(value)) incoming[field] = value;
    }
    tags = uniqueList([...normalizedTags, ...(existing.tags ?? [])]);
    entitiesByKey.delete(key);
    qualityByKey.delete(key);
  }

  return addEntity('armor', armorName, incoming, summary, tags, sourceName, license, quality, key);
}

function addItem(name, data, summary, tags, sourceName, license, quality = 50, forcedKey = undefined) {
  const itemName = canonicalItemName(name);
  let key = forcedKey ?? `item:${normalizeName(itemName)}`;
  if (!forcedKey) {
    const standardKey = `item-standard:${normalizeName(itemName)}`;
    if (entitiesByKey.has(standardKey)) key = standardKey;
  }
  const incoming = normalizeItemData(data);
  const normalizedTags = uniqueList((tags ?? []).filter(Boolean).map((t) => cleanText(String(t)).toLowerCase()));

  if (entitiesByKey.has(key)) {
    const existing = entitiesByKey.get(key);
    const existingQuality = qualityByKey.get(key) ?? 0;
    existing.data = existingQuality >= quality
      ? mergeItemLikeData(existing.data, incoming)
      : mergeItemLikeData(incoming, existing.data);
    existing.tags = uniqueList([...(existing.tags ?? []), ...normalizedTags]);
    if (!existing.summary && summary) existing.summary = cleanText(summary);
    if (quality > existingQuality) {
      existing.name = itemName;
      existing.sourceName = sourceName;
      existing.license = license;
      qualityByKey.set(key, quality);
    }
    return existing.id;
  }

  return addEntity('item', itemName, incoming, summary, normalizedTags, sourceName, license, quality, key);
}

function normalizeArmorData(data) {
  const out = { ...data };
  out.type = out.type || 'Standard';
  out.armorCategory = cleanText(out.armorCategory ?? '');
  out.baseArmor = cleanText(out.baseArmor ?? '');
  out.ac = cleanText(out.ac ?? '');
  out.strength = cleanText(out.strength ?? '');
  out.stealth = cleanText(out.stealth ?? '');
  out.price = cleanText(out.price ?? '');
  out.weight = cleanText(out.weight ?? '');
  out.rarity = normalizeRarity(out.rarity ?? '');
  out.bonus = normalizeWeaponBonus(out.bonus ?? '');
  out.requiresAttunement = Boolean(out.requiresAttunement);
  out.description = cleanText(out.description ?? '');
  out.sources = uniqueList((out.sources ?? []).map(cleanText).filter(Boolean));
  out.sourceFile = cleanText(out.sourceFile ?? '');
  out.sourcePage = out.sourcePage ?? null;
  return out;
}

function normalizeItemData(data) {
  const out = { ...data };
  out.type = cleanText(out.type ?? '');
  out.rarity = normalizeRarity(out.rarity ?? '');
  out.price = cleanText(out.price ?? '');
  out.weight = cleanText(out.weight ?? '');
  out.requiresAttunement = Boolean(out.requiresAttunement);
  out.description = cleanText(out.description ?? '');
  out.sources = uniqueList((out.sources ?? []).map(cleanText).filter(Boolean));
  out.sourceFile = cleanText(out.sourceFile ?? '');
  out.sourcePage = out.sourcePage ?? null;
  return out;
}

function mergeItemLikeData(primary, secondary) {
  const out = { ...primary };
  for (const [field, value] of Object.entries(secondary ?? {})) {
    if (field === 'sources') continue;
    if (isBlankWeaponValue(out[field]) && !isBlankWeaponValue(value)) out[field] = value;
  }
  out.sources = uniqueList([...(primary?.sources ?? []), ...(secondary?.sources ?? [])]);
  return out;
}

function normalizeWeaponData(data) {
  const out = { ...data };
  out.type = out.type || 'Standard';
  out.properties = uniqueList((out.properties ?? []).map(cleanWeaponProperty).filter(Boolean));
  out.sources = uniqueList((out.sources ?? []).map(cleanText).filter(Boolean));
  if (out.damageDice) out.damageDice = normalizeDamageDice(out.damageDice);
  if (out.damageType) out.damageType = cleanText(out.damageType).toLowerCase();
  if (out.damage) out.damage = cleanText(out.damage);
  if (out.range) out.range = normalizeWeaponRange(out.range);
  if (out.rarity) out.rarity = normalizeRarity(out.rarity);
  if (out.bonus) out.bonus = normalizeWeaponBonus(out.bonus);
  return out;
}

function mergeWeaponData(primary, secondary) {
  const out = { ...primary };
  for (const [field, value] of Object.entries(secondary ?? {})) {
    if (field === 'sources') continue;
    if (field === 'properties') continue;
    if (isBlankWeaponValue(out[field]) && !isBlankWeaponValue(value)) out[field] = value;
  }
  out.sources = uniqueList([...(primary?.sources ?? []), ...(secondary?.sources ?? [])]);
  out.properties = uniqueList([...(primary?.properties ?? []), ...(secondary?.properties ?? [])]);
  return out;
}

function isBlankWeaponValue(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function uniqueList(items) {
  const seen = new Set();
  const out = [];
  for (const item of items ?? []) {
    const cleaned = cleanText(String(item));
    if (!cleaned) continue;
    const key = normalizeName(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function parseNpcContent(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);

  if (/AideDD\.org - PNJ\.pdf/i.test(sourceFile)) {
    parseGenericNpcProfiles(text, sourceFile, sourceName, license, quality, {
      profileKind: 'Profil générique AideDD',
      forceKeyPrefix: 'npc-profile:aidedd',
    });
  }

  if (/Compendium Monstrueux - Personnages/i.test(sourceFile)) {
    parseGenericNpcProfiles(text, sourceFile, sourceName, license, quality, {
      profileKind: 'Profil de PNJ du compendium',
      forceKeyPrefix: 'npc-profile:compendium-personnages',
      disambiguateGroup: true,
    });
  }

  parseNamedNpcSeeds(text, sourceFile, sourceName, license, quality);
}

function parseCampaignContent(fullText, sourceFile, sourceName, license, quality) {
  const meta = CAMPAIGNS[sourceFile];
  if (!meta || quality <= 0) return;

  const text = normalizePdfText(fullText);
  const pages = splitPages(text);
  if (!pages.length || meaningfulPdfTextLength(text) < 500) return;

  const toc = extractToc(text);
  const chapterRanges = buildCampaignChapterRanges(text, pages, toc, sourceFile, meta);

  addCampaignChapterSections(pages, sourceFile, meta, sourceName, license, quality, chapterRanges);
  addCampaignPageArchiveSections(pages, sourceFile, meta, sourceName, license, quality - 8);
  addCampaignTocLocations(text, pages, toc, sourceFile, meta, sourceName, license, quality - 2, chapterRanges);
  addCampaignPageHeadingLocations(pages, sourceFile, meta, sourceName, license, quality, chapterRanges);
  addCampaignKnownLocations(pages, sourceFile, meta, sourceName, license, quality + 1, chapterRanges);
}

function addCampaignChapterSections(pages, sourceFile, meta, sourceName, license, quality, ranges) {
  for (let index = 0; index < meta.chapters.length; index += 1) {
    const chapter = meta.chapters[index];
    const range = ranges[index] ?? fallbackCampaignChapterRange(pages, meta, index);
    const pageStart = clampPage(range.pageStart, pages.length);
    const pageEnd = clampPage(Math.max(range.pageEnd ?? pageStart, pageStart), pages.length);
    const content = linkCampaignText(campaignPagesContent(pages, pageStart, pageEnd), meta, sourceFile);
    if (!content || content.length < 120) continue;

    addEntity('adventureSection', `${meta.title} — ${chapter}`, {
      campaign: meta.title,
      kind: campaignSectionKind(chapter),
      sourceFile,
      pageStart,
      pageEnd,
      content,
    }, `${meta.title} · p. ${pageStart}-${pageEnd}`, ['campagne', 'chapitre', meta.title, chapter], sourceName, license, quality, `section:${meta.title}:${index}`);
  }
}

function addCampaignPageArchiveSections(pages, sourceFile, meta, sourceName, license, quality) {
  const chunkSize = 3;
  for (let start = 1; start <= pages.length; start += chunkSize) {
    const end = Math.min(pages.length, start + chunkSize - 1);
    const content = linkCampaignText(campaignPagesContent(pages, start, end), meta, sourceFile);
    if (!content || content.length < 180 || isMostlyCampaignFrontMatter(content)) continue;

    addEntity('adventureSection', `${meta.title} — Pages ${start}-${end}`, {
      campaign: meta.title,
      kind: 'Section',
      sourceFile,
      pageStart: start,
      pageEnd: end,
      content,
    }, `${meta.title} · pages ${start}-${end}`, ['campagne', 'pages', 'contenu', meta.title], sourceName, license, quality, `section-pages:${meta.title}:${start}-${end}`);
  }
}

function addCampaignTocLocations(text, pages, toc, sourceFile, meta, sourceName, license, quality, chapterRanges) {
  const usableToc = toc
    .map((entry) => ({ ...entry, title: cleanCampaignLocationTitle(entry.title) }))
    .filter((entry) => isLikelyCampaignLocationTitle(entry.title));

  for (const entry of usableToc) {
    const sourcePage = findCampaignHeadingPage(pages, entry.title) ?? (entry.page > 0 && entry.page <= pages.length ? entry.page : null);
    if (!sourcePage) continue;
    const description = campaignLocationDescription(pages, sourcePage, entry.title);
    if (!description || description.length < 120) continue;
    addCampaignLocation(meta, sourceFile, entry.title, inferCampaignRegion(sourcePage, meta, chapterRanges), sourcePage, description, sourceName, license, quality);
  }
}

function addCampaignPageHeadingLocations(pages, sourceFile, meta, sourceName, license, quality, chapterRanges) {
  for (let pageNumber = 1; pageNumber <= pages.length; pageNumber += 1) {
    const pageText = cleanCampaignPageText(pages[pageNumber - 1]);
    if (!pageText || pageText.length < 160 || isCampaignTocPage(pageText)) continue;

    const headings = extractCampaignPageLocationHeadings(pageText);
    for (let i = 0; i < headings.length; i += 1) {
      const heading = headings[i];
      const next = headings[i + 1];
      let description = cleanText(pageText.slice(heading.index, next?.index ?? undefined));
      if (description.length < 140) description = campaignLocationDescription(pages, pageNumber, heading.title);
      if (!description || description.length < 120) continue;

      addCampaignLocation(meta, sourceFile, heading.title, inferCampaignRegion(pageNumber, meta, chapterRanges), pageNumber, description, sourceName, license, quality);
    }
  }
}

function addCampaignKnownLocations(pages, sourceFile, meta, sourceName, license, quality, chapterRanges) {
  const entries = campaignKnownLocationRanges(sourceFile);
  for (const entry of entries) {
    const pageStart = clampPage(entry.pageStart, pages.length);
    const pageEnd = clampPage(entry.pageEnd, pages.length);
    const description = campaignPagesContent(pages, pageStart, Math.max(pageStart, pageEnd));
    if (!description || description.length < 160) continue;
    addCampaignLocation(meta, sourceFile, entry.name, inferCampaignRegion(pageStart, meta, chapterRanges), pageStart, description, sourceName, license, quality, { force: true });
  }
}

function campaignKnownLocationRanges(sourceFile) {
  if (/Strahd/i.test(sourceFile)) {
    return [
      { name: 'Campement de l’étang de Tser', pageStart: 37, pageEnd: 39 },
      { name: 'Village de Barovie', pageStart: 43, pageEnd: 50 },
      { name: 'Château de Ravenloft', pageStart: 52, pageEnd: 96 },
      { name: 'Vallaki', pageStart: 97, pageEnd: 123 },
      { name: 'Auberge de l’Eau Bleue', pageStart: 100, pageEnd: 103 },
      { name: 'Campement vistani de Vallaki', pageStart: 121, pageEnd: 123 },
      { name: 'Moulin à ossements', pageStart: 127, pageEnd: 129 },
      { name: 'Argynvostholt', pageStart: 130, pageEnd: 144 },
      { name: 'Krezk', pageStart: 145, pageEnd: 159 },
      { name: 'Abbaye Sainte-Markovia', pageStart: 151, pageEnd: 159 },
      { name: 'Domaine viticole du Magicien des vins', pageStart: 172, pageEnd: 181 },
      { name: 'Temple d’Ambre', pageStart: 184, pageEnd: 198 },
    ];
  }
  if (/Annihilation/i.test(sourceFile)) {
    return [
      { name: 'Port Nyanzaru', pageStart: 15, pageEnd: 36 },
      { name: 'Fort Beluarian', pageStart: 55, pageEnd: 57 },
      { name: 'Omu', pageStart: 95, pageEnd: 111 },
      { name: 'Fanum du Serpent nocturne', pageStart: 112, pageEnd: 128 },
      { name: 'Tombeau des neuf dieux', pageStart: 130, pageEnd: 177 },
    ];
  }
  if (/Donjon du Mage/i.test(sourceFile)) {
    return [
      { name: 'Undermountain', pageStart: 5, pageEnd: 13 },
      { name: 'Skullport', pageStart: 304, pageEnd: 322 },
    ];
  }
  if (/Sorcelume|Carnaval/i.test(sourceFile)) {
    return [
      { name: 'Prismeer', pageStart: 58, pageEnd: 62 },
      { name: 'Carnaval de Sorcelume', pageStart: 24, pageEnd: 56 },
      { name: 'Guichet', pageStart: 32, pageEnd: 33 },
      { name: 'Calliope', pageStart: 33, pageEnd: 33 },
      { name: 'Coin des forains', pageStart: 33, pageEnd: 34 },
      { name: 'Course d’escargots', pageStart: 35, pageEnd: 36 },
      { name: 'Galerie des illusions', pageStart: 37, pageEnd: 38 },
      { name: 'Gondoles aux cygnes', pageStart: 38, pageEnd: 39 },
      { name: 'Grand chapiteau', pageStart: 39, pageEnd: 40 },
      { name: 'Lac Hymnargent', pageStart: 40, pageEnd: 41 },
      { name: 'Manège', pageStart: 41, pageEnd: 42 },
      { name: 'Mine des mystères', pageStart: 43, pageEnd: 44 },
      { name: 'Petits étals', pageStart: 44, pageEnd: 48 },
      { name: 'Royaume des pixies', pageStart: 48, pageEnd: 49 },
      { name: 'Théière à bulles', pageStart: 49, pageEnd: 49 },
      { name: 'Verger ripailleur', pageStart: 49, pageEnd: 50 },
      { name: 'Céans', pageStart: 58, pageEnd: 98 },
      { name: 'Tour penchée', pageStart: 69, pageEnd: 70 },
      { name: 'Colline Télémie', pageStart: 71, pageEnd: 72 },
      { name: 'Péage des brigands', pageStart: 72, pageEnd: 75 },
      { name: 'Déchéance', pageStart: 75, pageEnd: 88 },
      { name: 'Cour aux miasmes', pageStart: 75, pageEnd: 87 },
      { name: 'Chaumière de Bavlorna', pageStart: 88, pageEnd: 98 },
      { name: 'Çà-et-là', pageStart: 100, pageEnd: 131 },
      { name: 'Grotte de Nib', pageStart: 106, pageEnd: 108 },
      { name: 'Lac Indocile', pageStart: 110, pageEnd: 112 },
      { name: 'Longuesouche', pageStart: 113, pageEnd: 130 },
      { name: 'Par-delà', pageStart: 134, pageEnd: 169 },
      { name: 'Cromlech de Lockbury', pageStart: 142, pageEnd: 144 },
      { name: 'Phares féeriques', pageStart: 144, pageEnd: 146 },
      { name: 'La Mine Brigganock', pageStart: 146, pageEnd: 150 },
      { name: 'Cornemère', pageStart: 150, pageEnd: 169 },
      { name: 'Palais du Désir ardent', pageStart: 172, pageEnd: 208 },
      { name: 'Chambre de Zybilna', pageStart: 201, pageEnd: 202 },
      { name: 'Chambre forte', pageStart: 204, pageEnd: 205 },
    ];
  }
  return [];
}

function addCampaignLocation(meta, sourceFile, rawName, region, sourcePage, description, sourceName, license, quality, options = {}) {
  const name = cleanCampaignLocationTitle(rawName);
  if (!options.force && !isLikelyCampaignLocationTitle(name)) return;
  const linkedDescription = linkCampaignText(cleanText(description), meta, sourceFile);
  const key = /Sorcelume|Carnaval/i.test(sourceFile)
    ? `location:${meta.title}:${normalizeName(name)}`
    : `location:${meta.title}:${normalizeName(name)}:${sourcePage ?? 'x'}`;

  addEntity('location', name, {
    campaign: meta.title,
    region: region || meta.setting || '',
    mapImage: '',
    sourceFile,
    sourcePage,
    description: linkedDescription,
  }, `${meta.title} · ${region || 'Lieu'} · p. ${sourcePage}`, ['lieu', 'campagne', meta.title, region, sourceName], sourceName, license, quality, key);
}

function buildCampaignChapterRanges(text, pages, toc, sourceFile, meta) {
  const manualRanges = meta.chapters.map((chapter) => campaignManualChapterRange(sourceFile, chapter, pages.length));
  const ranges = new Array(meta.chapters.length).fill(null);
  const starts = new Array(meta.chapters.length).fill(null);

  for (let i = 0; i < meta.chapters.length; i += 1) {
    const headingPage = findCampaignChapterPage(pages, meta.chapters[i]);
    if (headingPage) {
      starts[i] = headingPage;
      continue;
    }

    const tocEntry = findCampaignTocEntry(toc, meta.chapters[i]);
    if (tocEntry?.page > 0 && tocEntry.page <= pages.length && !isMostlyCampaignFrontMatter(cleanCampaignPageText(pages[tocEntry.page - 1]))) starts[i] = tocEntry.page;
    if (!starts[i] && manualRanges[i]) {
      ranges[i] = manualRanges[i];
      starts[i] = manualRanges[i].pageStart;
    }
  }

  const firstContent = firstCampaignContentPage(pages);
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i]) continue;
    starts[i] = inferMissingCampaignChapterStart(starts, pages.length, firstContent, i);
  }

  for (let i = 0; i < starts.length; i += 1) {
    if (ranges[i]) continue;
    const pageStart = clampPage(starts[i] ?? firstContent, pages.length);
    const nextStart = starts.slice(i + 1).find((page) => page && page > pageStart);
    const pageEnd = clampPage((nextStart ?? pages.length + 1) - 1, pages.length);
    ranges[i] = { pageStart, pageEnd: Math.max(pageStart, pageEnd) };
  }

  return ranges;
}

function campaignManualChapterRange(sourceFile, chapter, totalPages) {
  const key = normalizeName(chapter);
  const clamp = (start, end) => ({ pageStart: clampPage(start, totalPages), pageEnd: clampPage(end, totalPages) });

  if (/Strahd/i.test(sourceFile)) {
    if (/dans-les-brumes/.test(key)) return clamp(16, 42);
    if (/village-de-barovie/.test(key)) return clamp(43, 50);
    if (/vallaki/.test(key)) return clamp(97, 123);
    if (/chateau-de-ravenloft/.test(key)) return clamp(52, 96);
    if (/krezk/.test(key)) return clamp(145, 159);
    if (/temple-dambre/.test(key)) return clamp(184, 198);
    if (/lieux-hantes-de-barovie/.test(key)) return clamp(124, 183);
    if (/conclusion-contre-strahd/.test(key)) return clamp(199, totalPages);
  }

  if (/Tonnerre/i.test(sourceFile)) {
    if (/grand-chambardement/.test(key)) return clamp(18, 54);
    if (/rumeurs-dans-le-nord/.test(key)) return clamp(55, 103);
    if (/frontieres-sauvages/.test(key)) return clamp(104, 164);
    if (/tanieres-des-geants/.test(key)) return clamp(165, 246);
    if (/maelstrom/.test(key)) return clamp(247, 269);
    if (/roi-disparu/.test(key)) return clamp(270, 294);
    if (/destin-des-geants/.test(key)) return clamp(295, totalPages);
  }

  if (/Rencontres urbaines/i.test(sourceFile)) {
    if (/rencontres-de-rue/.test(key)) return clamp(7, 31);
    if (/quartiers-et-ambiance/.test(key)) return clamp(32, 45);
    if (/complications-urbaines/.test(key)) return clamp(46, 58);
    if (/pnj-et-evenements/.test(key)) return clamp(59, totalPages);
  }

  if (/Sorcelume|Carnaval/i.test(sourceFile)) {
    if (/introduction-au-c-ur-de-la-feerie/.test(key)) return clamp(5, 22);
    if (/chapitre-1-le-carnaval-de-sorcelume/.test(key)) return clamp(24, 57);
    if (/chapitre-2-ceans/.test(key)) return clamp(58, 99);
    if (/chapitre-3-ca-et-la/.test(key)) return clamp(100, 133);
    if (/chapitre-4-par-dela/.test(key)) return clamp(134, 171);
    if (/chapitre-5-le-palais-du-desir-ardent/.test(key)) return clamp(172, 208);
    if (/annexe-a-objets-magiques/.test(key)) return clamp(209, 215);
    if (/annexe-b-factions/.test(key)) return clamp(216, 229);
    if (/annexe-c-creatures/.test(key)) return clamp(230, 241);
    if (/annexes-d-e-interpretation-repliques-et-suivi/.test(key)) return clamp(242, totalPages);
  }

  return null;
}

function fallbackCampaignChapterRange(pages, meta, index) {
  const first = firstCampaignContentPage(pages);
  const usable = Math.max(1, pages.length - first + 1);
  const size = Math.max(1, Math.ceil(usable / meta.chapters.length));
  const pageStart = Math.min(pages.length, first + size * index);
  const pageEnd = Math.min(pages.length, pageStart + size - 1);
  return { pageStart, pageEnd };
}

function inferMissingCampaignChapterStart(starts, totalPages, firstContent, index) {
  let previousIndex = -1;
  let previousStart = firstContent;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (starts[i]) {
      previousIndex = i;
      previousStart = starts[i];
      break;
    }
  }

  let nextIndex = -1;
  let nextStart = totalPages + 1;
  for (let i = index + 1; i < starts.length; i += 1) {
    if (starts[i]) {
      nextIndex = i;
      nextStart = starts[i];
      break;
    }
  }

  if (nextIndex > index && nextStart > previousStart) {
    const gap = nextIndex - previousIndex;
    const step = Math.max(1, Math.floor((nextStart - previousStart) / gap));
    return Math.min(totalPages, previousStart + step * (index - previousIndex));
  }

  const remaining = starts.length - Math.max(previousIndex, 0);
  const step = Math.max(1, Math.floor((totalPages - previousStart + 1) / Math.max(1, remaining)));
  return Math.min(totalPages, previousStart + step * (index - previousIndex));
}

function findCampaignTocEntry(toc, chapter) {
  const aliases = campaignTitleAliases(chapter).map(normalizeName).filter(Boolean);
  return toc.find((entry) => {
    const title = normalizeName(entry.title);
    return aliases.some((alias) => title === alias || title.includes(alias) || alias.includes(title));
  });
}

function findCampaignChapterPage(pages, chapter) {
  const aliases = campaignTitleAliases(chapter).map(normalizeName).filter((alias) => alias.length >= 3);
  if (!aliases.length) return null;

  for (let i = 0; i < pages.length; i += 1) {
    const pageText = cleanCampaignPageText(pages[i]);
    if (!pageText || isCampaignTocPage(pageText) || isMostlyCampaignFrontMatter(pageText)) continue;
    const lines = pageText.split('\n').map((line) => cleanTitle(line)).filter(Boolean);
    for (const line of lines) {
      if (isCampaignChapterHeadingLine(line, aliases)) return i + 1;
    }
  }
  return null;
}

function isCampaignChapterHeadingLine(line, aliases) {
  if (line.length > 130) return false;
  const cleaned = cleanCampaignLocationTitle(line);
  const normalized = normalizeName(cleaned);
  const stripped = normalizeName(stripCampaignHeadingPrefix(cleaned));
  const hasChapterMarker = /^(?:chapitre|ch\.|episode|épisode|annexes?|annexe|niveau|niveaux|strate)\b/i.test(cleaned);
  const matched = aliases.some((alias) => normalized === alias || stripped === alias || normalized.endsWith(`-${alias}`) || stripped.includes(alias));
  if (hasChapterMarker && matched) return true;
  if (!hasChapterMarker && isMostlyUpper(cleaned) && matched && cleaned.split(/\s+/).length <= 8) return true;
  return false;
}

function findCampaignHeadingPage(pages, title) {
  const aliases = campaignTitleAliases(title).map(normalizeName).filter((alias) => alias.length >= 3);
  if (!aliases.length) return null;

  for (let i = 0; i < pages.length; i += 1) {
    const pageText = cleanCampaignPageText(pages[i]);
    if (!pageText || isCampaignTocPage(pageText)) continue;
    const lines = pageText.split('\n').map((line) => cleanTitle(line)).filter(Boolean);
    for (const line of lines) {
      if (campaignHeadingMatches(line, aliases)) return i + 1;
    }
  }
  return null;
}

function campaignHeadingMatches(line, aliases) {
  if (line.length > 120) return false;
  const cleaned = cleanCampaignLocationTitle(line);
  const normalized = normalizeName(cleaned);
  const stripped = normalizeName(stripCampaignHeadingPrefix(cleaned));
  return aliases.some((alias) => normalized === alias || stripped === alias || normalized.endsWith(`-${alias}`) || (normalized.includes(alias) && normalized.length <= alias.length + 18));
}

function campaignTitleAliases(title) {
  const cleaned = cleanTitle(title);
  const withoutChapter = cleaned
    .replace(/^(?:ch\.?|chapitre|episode|épisode)\s*\d+(?:-\d+)?\s*[:.-]?\s*/i, '')
    .replace(/^niveaux?\s+\d+(?:-\d+)?\s+d[’']undermountain\s*$/i, 'Undermountain')
    .replace(/^annexes?\s*[:.-]?\s*/i, '');
  const withoutArea = stripCampaignHeadingPrefix(withoutChapter);
  return uniqueList([cleaned, withoutChapter, withoutArea]);
}

function inferCampaignRegion(sourcePage, meta, chapterRanges) {
  const found = chapterRanges.find((range) => sourcePage >= range.pageStart && sourcePage <= range.pageEnd);
  if (!found) return meta.setting || '';
  const index = chapterRanges.indexOf(found);
  return meta.chapters[index] || meta.setting || '';
}

function firstCampaignContentPage(pages) {
  for (let i = 0; i < pages.length; i += 1) {
    const text = cleanCampaignPageText(pages[i]);
    if (text.length > 250 && !isMostlyCampaignFrontMatter(text)) return i + 1;
  }
  return 1;
}

function campaignPagesContent(pages, pageStart, pageEnd) {
  const out = [];
  for (let page = pageStart; page <= pageEnd; page += 1) {
    const text = cleanCampaignPageText(pages[page - 1]);
    if (!text) continue;
    out.push(`Page ${page}\n${text}`);
  }
  return cleanText(out.join('\n\n'));
}

function campaignLocationDescription(pages, sourcePage, title) {
  const pageText = cleanCampaignPageText(pages[sourcePage - 1]);
  if (!pageText) return '';
  const headings = extractCampaignPageLocationHeadings(pageText);
  const aliases = campaignTitleAliases(title).map(normalizeName).filter(Boolean);
  const foundIndex = headings.findIndex((heading) => aliases.some((alias) => normalizeName(heading.title) === alias || normalizeName(stripCampaignHeadingPrefix(heading.title)) === alias));
  if (foundIndex >= 0) {
    const start = headings[foundIndex].index;
    const end = headings[foundIndex + 1]?.index ?? pageText.length;
    const segment = cleanText(pageText.slice(start, end));
    if (segment.length >= 120) return segment;
  }

  const lines = pageText.split('\n');
  let offset = 0;
  for (const line of lines) {
    if (campaignHeadingMatches(line, aliases)) {
      const segment = cleanText(pageText.slice(offset));
      return segment.length >= 120 ? segment : cleanText(`${segment}\n\n${cleanCampaignPageText(pages[sourcePage] ?? '')}`);
    }
    offset += line.length + 1;
  }

  const nextPage = cleanCampaignPageText(pages[sourcePage] ?? '');
  return cleanText([pageText, nextPage].filter(Boolean).join('\n\n')).slice(0, 6000);
}

function extractCampaignPageLocationHeadings(pageText) {
  const headings = [];
  const lines = pageText.split('\n');
  let offset = 0;
  const seen = new Set();

  for (const rawLine of lines) {
    const line = cleanCampaignLocationTitle(rawLine);
    const index = offset + rawLine.indexOf(rawLine.trim());
    offset += rawLine.length + 1;

    if (!isLikelyCampaignLocationTitle(line)) continue;
    if (!isCampaignHeadingLine(line)) continue;

    const key = normalizeName(line);
    if (seen.has(key)) continue;
    seen.add(key);
    headings.push({ title: line, index: Math.max(0, index) });
  }

  return headings.sort((a, b) => a.index - b.index);
}

function isCampaignHeadingLine(line) {
  const stripped = stripCampaignHeadingPrefix(line);
  if (!looksLikeCampaignPlaceTitle(stripped)) return false;
  if (/^(?:[A-Z]\d+[A-Z]?|\d+[A-Z]?|[A-Z])\.\s+/i.test(line)) return hasCampaignPlaceKeyword(stripped);
  if (/^(?:\d+[A-Z]?(?:-\d+[A-Z]?)?)\s+/i.test(line) && isMostlyUpper(line)) return hasCampaignPlaceKeyword(stripped);
  if (/^(?:Strate|Niveau)\s+\d+/i.test(line)) return true;
  if (/^(?:Chapitre|Ch\.|Episode|Épisode)\s+\d+/i.test(line)) return hasCampaignPlaceKeyword(stripped);
  if (isMostlyUpper(line) && hasCampaignPlaceKeyword(line) && line.length <= 90) return true;
  return false;
}

function isLikelyCampaignLocationTitle(rawTitle) {
  const title = cleanCampaignLocationTitle(rawTitle);
  if (title.length < 3 || title.length > 110) return false;
  if (/^\d+$/.test(title)) return false;
  if (campaignRejectedLocationTitle(title)) return false;
  const stripped = stripCampaignHeadingPrefix(title);
  if (!looksLikeCampaignPlaceTitle(stripped)) return false;
  if (/^(?:[A-Z]\d+[A-Z]?|\d+[A-Z]?|[A-Z])\.\s+/i.test(title)) return hasCampaignPlaceKeyword(stripped);
  if (/^(?:Strate|Niveau)\s+\d+/i.test(title)) return true;
  return hasCampaignPlaceKeyword(title);
}

function campaignRejectedLocationTitle(title) {
  if (/rencontre/i.test(title)) return true;
  if (/^(?:ch\.|chapitre)\s*\d+/i.test(title)) return true;
  if (/^\d+\s*-\s*\d+/.test(title)) return true;
  const key = normalizeName(stripCampaignHeadingPrefix(title));
  if (!key) return true;
  const compactKey = key.replace(/-/g, '');
  if (/rencontre/.test(compactKey)) return true;
  if (/chap(?:i|f|j|l|t)?tre/.test(compactKey) || /^ch\d/.test(compactKey)) return true;
  if (/^(credits?|contents?|sommaire|table-des-matieres|dramatis-personae|introduction|contexte|presentation|secrets?|annexes?|appendix|index|open-game-license)$/.test(key)) return true;
  if (/^(tresor|recompenses?|developpements?|caracteristiques-generales|personnages-importants|pnj|npcs?|monstres?|objets?-magiques?|aides?-de-jeu|progression|guide-de-prononciation|credits?)$/.test(key)) return true;
  if (/rencontres?/.test(key)) return true;
  if (/^(rencontres?-aleatoires?|rumeurs?|quete?s?-secondaires?|factions?|actions?|reactions?|evenements?-speciaux?|questions?-en-suspens)$/.test(key)) return true;
  if (/^(la-creation-des-personnages|la-progression-des-personnages|running-the-adventure|story-overview|character-creation|character-advancement|suggested-character-levels)$/.test(key)) return true;
  if (/(acheter|equipement|creature|personnages?|attaque|touche|degats?|jet-de|reussir|echec|sorts?|emplacements?|dd|pv|ca|challenge|facteur-de-puissance)/.test(key)) return true;
  if (/\b(?:po|pa|pc|pp|mo|metres?|m)\b/.test(key) && /\d/.test(key)) return true;
  if (/(?:^|-)d?\d+d\d+(?:-|$)/i.test(key) || /(?:^|-)ld\d+(?:-|$)/i.test(key)) return true;
  return false;
}

function looksLikeCampaignPlaceTitle(title) {
  const cleaned = cleanCampaignLocationTitle(title);
  if (!cleaned || cleaned.length > 90) return false;
  if (/[.;!?]/.test(cleaned.replace(/^(?:[A-Z]\d+[A-Z]?|\d+[A-Z]?|[A-Z])\./i, ''))) return false;
  if (cleaned.split(/\s+/).length > 10) return false;
  const key = normalizeName(cleaned);
  if (/(?:^|-)d?\d+d\d+(?:-|$)/i.test(key) || /(?:^|-)ld\d+(?:-|$)/i.test(key)) return false;
  if (/(acheter|equipement|creature|personnages?|attaque|touche|degats?|jet-de|reussir|echec|sorts?|emplacements?|sauvegarde|cible|utilises?|tour|action|minute|minutes|round|rounds)/.test(key)) return false;
  if (/\b(?:po|pa|pc|pp|mo|metres?|m)\b/.test(key) && /\d/.test(key)) return false;
  if (cleaned.split(/\s+/).length > 5 && /(?:^|-)(?:a|est|sont|pour|sous|concue|bati|batit)(?:-|$)/.test(key)) return false;
  if (/^(?:apres|dans|quatre|un|une|des|les|la|le)-/.test(key) && cleaned.split(/\s+/).length > 5) return false;
  if (/^(?:un|une|des|les?|la|le)-/.test(key) && !hasCampaignPlaceKeyword(cleaned)) return false;
  return true;
}

function isShortCampaignPlaceTitle(title) {
  const cleaned = cleanCampaignLocationTitle(title);
  if (cleaned.length > 55) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  return !campaignRejectedLocationTitle(cleaned);
}

function hasCampaignPlaceKeyword(title) {
  const key = normalizeName(title);
  const parts = key.split('-').filter(Boolean);
  const matchesKeyword = (keyword) => parts.some((part) => {
    if (part === keyword || part === `${keyword}s` || part === `l${keyword}` || part === `d${keyword}`) return true;
    if (part.endsWith(keyword) && part.length <= keyword.length + 1) return true;
    if (part.startsWith(keyword) && part.length <= keyword.length + 2) return true;
    return false;
  });
  const keywords = [
    'abbaye', 'allee', 'ancrage', 'antre', 'auberge', 'baie', 'bains', 'bar', 'bassin', 'bois', 'bourg', 'bureau', 'cale', 'camp', 'campement',
    'carnaval', 'caverne', 'cavernes', 'cellule', 'chapelle', 'chambre', 'chambres', 'champ', 'chateau', 'cimetiere', 'cite', 'colisee', 'commerce', 'cour', 'crique',
    'crypte', 'donjon', 'docks', 'ecurie', 'eglise', 'ecloserie', 'enclos', 'embranchement', 'entree', 'entrepot', 'entrepots', 'epave', 'falaises', 'fanum', 'fontaine', 'fort',
    'foyer', 'foret', 'forge', 'fosse', 'gate', 'grange', 'grenier', 'grille', 'grotte', 'halls', 'ile', 'inn', 'jardin', 'lac', 'labyrinthe', 'loge', 'maison',
    'manoir', 'marche', 'masure', 'mausolee', 'mine', 'monastere', 'moulin', 'niveau', 'palais', 'parcours', 'phare', 'planque', 'pont', 'portail',
    'port', 'porte', 'prison', 'quartier', 'quartiers', 'refuge', 'repaire', 'route', 'ruelle', 'salle', 'salles',
    'sanctuaire', 'shrine', 'souk', 'strate', 'statue', 'taverne', 'tavern', 'temple', 'tenure', 'terres', 'theatre',
    'tombeau', 'tour', 'tours', 'tribunal', 'trone', 'vallee', 'villa', 'village',
  ];
  return keywords.some((keyword) => matchesKeyword(keyword));
}

function cleanCampaignLocationTitle(text) {
  return cleanTitle(text)
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/, '')
    .replace(/\.{2,}/g, ' ')
    .replace(/\bp\.?\s*\d+$/i, '')
    .replace(/\s+\d{1,3}$/g, '')
    .replace(/[•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCampaignHeadingPrefix(title) {
  return cleanTitle(title)
    .replace(/^(?:[A-Z]\d+[A-Z]?|\d+[A-Z]?|[A-Z])\.\s*/i, '')
    .replace(/^(?:Strate|Niveau|Chapitre|Ch\.|Episode|Épisode)\s+\d+(?:-\d+)?\s*[:.-]?\s*/i, '')
    .trim();
}

function cleanCampaignPageText(pageText) {
  const lines = cleanText(pageText)
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^DUNGEONS\s*&\s*DRAGONS/i.test(line));
  return cleanText(lines.join('\n'));
}

function isCampaignTocPage(text) {
  const cleaned = cleanText(text);
  if (!/(sommaire|table des matières|table des matieres|contents)/i.test(cleaned)) return false;
  const numberedLines = cleaned.split('\n').filter((line) => /\.{2,}|\s\d{1,3}$/.test(line)).length;
  return numberedLines >= 4 || cleaned.length < 3500;
}

function isMostlyCampaignFrontMatter(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return true;
  if (cleaned.length < 180) return true;
  if (/^(credits?|crédits|contents?|sommaire|table des matières|table des matieres|on the cover|en couverture)/i.test(cleaned) && cleaned.length < 2200) return true;
  return false;
}

function campaignSectionKind(chapter) {
  if (/annexe/i.test(chapter)) return 'Annexe';
  if (/épisode|episode/i.test(chapter)) return 'Épisode';
  if (/lieu|village|vallaki|krezk|château|chateau|waterdeep|undermountain/i.test(chapter)) return 'Lieu';
  return 'Chapitre';
}

function clampPage(page, totalPages) {
  const n = Number(page);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.trunc(n)), Math.max(1, totalPages));
}

function parseArmorTables(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);
  const armorBlockIndex = literalIndexOfAny(text, ['Armure matelassée', 'ARMURE MATELASSÉE'], 10000);
  const armorFallbackIndex = literalIndexOfAny(text, ['Armure matelassée', 'ARMURE MATELASSÉE']);
  const armorIndex = armorBlockIndex >= 0 ? armorBlockIndex : armorFallbackIndex >= 0 ? armorFallbackIndex : 0;
  const page = pageForIndex(text, armorIndex);
  const descriptions = extractArmorDescriptions(text);

  for (const armor of STANDARD_ARMORS) {
    const description = descriptions.get(normalizeName(armor.name)) ?? armor.description ?? '';
    const source = formatItemSource(sourceName, sourceFile, page);
    addArmor(armor.name, {
      type: 'Standard',
      armorCategory: armor.armorCategory,
      baseArmor: '',
      ac: armor.ac,
      strength: armor.strength,
      stealth: armor.stealth,
      price: armor.price,
      weight: armor.weight,
      rarity: '',
      bonus: '',
      requiresAttunement: false,
      description,
      sources: [source],
      sourceFile,
      sourcePage: page,
    }, [armor.armorCategory, armor.ac, armor.price].filter(Boolean).join(' · '), ['armure', 'standard', armor.armorCategory, sourceName], sourceName, license, quality);
  }
}

function parseStandardEquipment(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);
  const equipmentBlockIndex = literalIndexOfAny(text, ["ÉQUIPEMENT D'AVENTURIER", 'ÉQUIPEMENT D’AVENTURIER'], 10000);
  const equipmentItemIndex = literalIndexOfAny(text, ['Sac à dos', 'Potion de soins'], 10000);
  const equipmentFallbackIndex = literalIndexOfAny(text, ["Équipement d'aventurier", 'Équipement d’aventurier']);
  const start = equipmentBlockIndex >= 0 ? equipmentBlockIndex : equipmentItemIndex >= 0 ? equipmentItemIndex : equipmentFallbackIndex >= 0 ? equipmentFallbackIndex : 0;
  const page = pageForIndex(text, start);
  const source = formatItemSource(sourceName, sourceFile, page);

  for (const item of STANDARD_EQUIPMENT) {
    addItem(item.name, {
      type: item.type,
      rarity: '',
      price: item.price,
      weight: item.weight,
      requiresAttunement: false,
      description: item.description ?? '',
      sources: [source],
      sourceFile,
      sourcePage: page,
    }, [item.type, item.price, item.weight].filter(Boolean).join(' · '), ['objet', 'équipement', item.type, sourceName], sourceName, license, quality, `item-standard:${normalizeName(item.name)}`);
  }
}

function parseMagicArmorsAndItems(fullText, sourceFile, sourceName, license, quality) {
  if (quality <= 0) return;
  const full = normalizePdfText(fullText);
  const scan = magicItemBlockScanText(full, sourceFile);
  const text = scan.text;
  if (!text) return;
  const startRe = /(?:^|\n)([^\n]{2,100})\n(Arme|Armure|Objet merveilleux|Potion|Anneau|Baguette|Bâton|Sceptre|Parchemin|Bouclier|Bottes|Cape|Casque|Gemme|Livre|Grimoire|Pierre|Sac|Huile)\s*(?:\(([^)\n]+)\))?\s*,?\s*([^\n]*)/gi;
  const starts = [];
  let match;
  while ((match = startRe.exec(text))) {
    const rawName = cleanMagicItemName(match[1]);
    const itemType = cleanText(match[2]);
    if (/^Arme$/i.test(itemType)) continue;
    if (!isLikelyMagicItemName(rawName)) continue;
    starts.push({
      index: match.index + (match[0].startsWith('\n') ? 1 : 0),
      contentStart: startRe.lastIndex,
      rawName,
      itemType,
      detail: cleanText(match[3] ?? ''),
      meta: cleanText(match[4] ?? ''),
    });
  }
  starts.push(...findInlineMagicItemStarts(text));
  starts.sort((a, b) => a.index - b.index);

  for (let i = starts.length - 1; i > 0; i -= 1) {
    if (starts[i].index - starts[i - 1].index < 8 && normalizeName(starts[i].rawName) === normalizeName(starts[i - 1].rawName)) {
      starts.splice(i, 1);
    }
  }
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const next = starts[i + 1]?.index ?? text.length;
    const hardEnd = Math.min(next, start.contentStart + 3600);
    const end = findMagicWeaponDescriptionEnd(text, start.contentStart, hardEnd);
    const description = cleanMagicItemDescription(text.slice(start.contentStart, end));
    if (!description && !/Guide Complet de Xanathar|Guide du mai|Guide du ma/i.test(sourceFile)) continue;

    const sourcePage = pageForIndex(full, scan.offset + start.index);
    const metaText = normalizeMagicText(`${start.detail}\n${start.meta}\n${description}`);
    const rarity = parseWeaponRarity(metaText);
    const requiresAttunement = /harmonisation|harmonis|lien|nécessite un|necessite un/i.test(metaText);
    const source = formatItemSource(sourceName, sourceFile, sourcePage);

    if (isMagicArmorType(start.itemType)) {
      const name = canonicalArmorName(start.rawName);
      const baseArmor = normalizeBaseArmor(start.detail || inferBaseArmorFromName(name));
      const base = findBaseArmorData(baseArmor);
      const bonus = parseWeaponBonus(`${name}\n${start.meta}\n${description}`);
      addArmor(name, {
        type: 'Magique',
        armorCategory: inferArmorCategory(baseArmor, name),
        baseArmor,
        ac: base?.ac ?? '',
        strength: base?.strength ?? '',
        stealth: base?.stealth ?? '',
        price: '',
        weight: base?.weight ?? '',
        rarity,
        bonus,
        requiresAttunement,
        description,
        sources: [source],
        sourceFile,
        sourcePage,
      }, [baseArmor || 'Armure', rarity || 'magique', bonus].filter(Boolean).join(' · '), ['armure', 'magique', rarity, bonus, baseArmor, sourceName], sourceName, license, quality);
    } else {
      const name = canonicalItemName(start.rawName);
      const type = normalizeMagicItemType(start.itemType);
      addItem(name, {
        type,
        rarity,
        price: '',
        weight: '',
        requiresAttunement,
        description,
        sources: [source],
        sourceFile,
        sourcePage,
      }, [type, rarity || 'magique'].filter(Boolean).join(' · '), ['objet', 'magique', type, rarity, sourceName], sourceName, license, quality);
    }
  }
}

function magicItemBlockScanText(text, sourceFile) {
  if (/Guide Complet de Xanathar/i.test(sourceFile)) {
    const start = literalIndexOfAny(text, ['AMULETTE MÉCANIQUE', 'AMULETTE MECANIQUE']);
    const end = firstPositiveIndex([
      literalIndexOfAny(text, ["LES TABLES D'OBJETS MAGIQUES", 'LES TABLES D’OBJETS MAGIQUES'], Math.max(0, start)),
      literalIndexOfAny(text, ['OBJETS MINEURS COURANTS'], Math.max(0, start)),
    ], text.length);
    return start >= 0 ? { text: text.slice(start, end), offset: start } : { text: '', offset: 0 };
  }

  if (/Guide du mai|Guide du ma/i.test(sourceFile)) {
    const start = firstPositiveIndex([
      literalIndexOfAny(text, ['OBJETS MAGIQUES DE A']),
      literalIndexOfAny(text, ['AILES DE VOL']),
      literalIndexOfAny(text, ['ARMURE +1']),
    ], -1);
    const end = firstPositiveIndex([
      literalIndexOfAny(text, ['OBJETS INTELLIGENTS'], Math.max(0, start)),
      literalIndexOfAny(text, ['ARTÉFACTS', 'ARTEFACTS'], Math.max(0, start)),
    ], text.length);
    return start >= 0 ? { text: text.slice(start, end), offset: start } : { text: '', offset: 0 };
  }

  return { text, offset: 0 };
}

function literalIndexOfAny(text, needles, fromIndex = 0) {
  return firstPositiveIndex(needles.map((needle) => text.indexOf(needle, fromIndex)), -1);
}

function findInlineMagicItemStarts(text) {
  const types = 'Arme|Armure|Objet merveilleux|Potion|Anneau|Baguette|Bâton|Sceptre|Parchemin|Bouclier|Bottes|Cape|Casque|Gemme|Livre|Grimoire|Pierre|Sac|Huile';
  const re = new RegExp(`([A-ZÀ-ÖØ-ÞŒÆ0-9][A-ZÀ-ÖØ-ÞŒÆ0-9'’+\\- ]{2,92})\\s+(${types})\\s*(?:\\(([^)]{1,120})\\))?\\s*,?\\s*([^A-Z\\n]{0,180})`, 'g');
  const starts = [];
  let match;
  while ((match = re.exec(text))) {
    const itemType = cleanText(match[2]);
    if (/^Arme$/i.test(itemType)) continue;

    let rawName = cleanMagicItemName(match[1]);
    const detail = cleanText(match[3] ?? '');
    if (/^\d+\s+OU\s+\+\d/i.test(rawName) && /^Armure$/i.test(itemType)) {
      rawName = /bouclier/i.test(detail) ? 'Bouclier +1/+2/+3' : 'Armure +1/+2/+3';
    }
    if (!isLikelyMagicItemName(rawName)) continue;
    if (isLikelyInlineCaption(rawName)) continue;

    starts.push({
      index: match.index,
      contentStart: re.lastIndex,
      rawName,
      itemType,
      detail,
      meta: cleanText(match[4] ?? ''),
    });
  }
  return starts;
}

function parseMagicItemTableReferences(fullText, sourceFile, sourceName, license, quality) {
  if (!/Guide Complet de Xanathar/i.test(sourceFile)) return;
  const text = normalizePdfText(fullText);
  const rowRe = /([A-ZÀ-ÖØ-Þa-zà-öø-ÿ0-9][A-ZÀ-ÖØ-Þa-zà-öø-ÿ0-9'’+\- ]{2,80})\s+(Objet merveilleux|Armure|Anneau|Baguette|Bâton|Potion|Parchemin|Sceptre|Cape|Bottes|Gemme|Livre|Grimoire|Pierre|Sac)\s+(Oui(?:\s*\([^)]+\))?|Non)/g;
  let match;
  while ((match = rowRe.exec(text))) {
    const name = cleanMagicItemName(match[1]);
    const type = normalizeMagicItemType(match[2]);
    if (!isLikelyMagicItemName(name) || /Objet Type Harmonisation/i.test(name)) continue;
    const requiresAttunement = /^Oui/i.test(match[3]);
    const sourcePage = pageForIndex(text, match.index);
    const pageSource = formatItemSource(sourceName, sourceFile, sourcePage);

    if (/^Armure$/i.test(type)) {
      const armorName = canonicalArmorName(name);
      const baseArmor = normalizeBaseArmor(inferBaseArmorFromName(armorName));
      const base = findBaseArmorData(baseArmor);
      addArmor(armorName, {
        type: 'Magique',
        armorCategory: inferArmorCategory(baseArmor, armorName),
        baseArmor,
        ac: base?.ac ?? '',
        strength: base?.strength ?? '',
        stealth: base?.stealth ?? '',
        price: '',
        weight: base?.weight ?? '',
        rarity: '',
        bonus: parseWeaponBonus(armorName),
        requiresAttunement,
        description: `Référence issue des tables d'objets magiques de ${sourceName}.`,
        sources: [pageSource],
        sourceFile,
        sourcePage,
      }, `Armure magique · table ${sourceName}`, ['armure', 'magique', 'table d’objets magiques', sourceName], sourceName, license, Math.max(45, quality - 20));
    } else {
      addItem(name, {
        type,
        rarity: '',
        price: '',
        weight: '',
        requiresAttunement,
        description: `Référence issue des tables d'objets magiques de ${sourceName}.`,
        sources: [pageSource],
        sourceFile,
        sourcePage,
      }, `${type} · table ${sourceName}`, ['objet', 'magique', 'table d’objets magiques', type, sourceName], sourceName, license, Math.max(45, quality - 20));
    }
  }
}

function parseKnownCampaignItems(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);
  const entries = [];

  if (/Strahd/i.test(sourceFile)) {
    entries.push(
      { name: 'Livre de Strahd', type: 'Objet merveilleux', rarity: 'Unique', needles: ['LIVRE DE STRAHD'], maxLength: 1500 },
      { name: 'Icône de Ravenloft', type: 'Objet merveilleux', rarity: 'Légendaire', needles: ['ICÔNE DE RAVENLOFT'], maxLength: 1500 },
      { name: 'Symbole sacré de Ravenkind', type: 'Objet merveilleux', rarity: 'Légendaire', needles: ['SYMBOLE SACRÉ DE RAVENKIND', 'SYMBOLE SACRE DE RAVENKIND'], maxLength: 1600 },
    );
  }

  if (/Annihilation/i.test(sourceFile)) {
    entries.push(
      { name: 'Amulette du crâne noir', type: 'Objet merveilleux', rarity: 'Très rare', needles: ['AMULETTE DU CRÂNE NOIR', 'AMULETTE DU CRANE NOIR'], maxLength: 1300 },
      { name: 'Masque de la bête', type: 'Objet merveilleux', rarity: 'Rare', needles: ['MASQUE DE LA BÊTE', 'MASQUE DE LA BETE'], maxLength: 1200 },
    );
  }

  if (/Waterdeep - Le Vol/i.test(sourceFile)) {
    entries.push(
      { name: 'Pierre de Golorr', type: 'Objet merveilleux', rarity: 'Artefact', needles: ['PIERRE DE GOLORR'], maxLength: 2200 },
      { name: 'Bâton-dragon d’Ahghairon', type: 'Bâton', rarity: 'Légendaire', needles: ["BÂTON-DRAGON D'AHGHAIRON", 'BÂTON-DRAGON D’AHGHAIRON'], maxLength: 1800 },
      { name: 'Clé de la chambre forte des dragons', type: 'Objet merveilleux', rarity: 'Unique', needles: ['CLÉS DE LA CHAMBRE FORTE', 'LES CLÉS DE LA CHAMBRE FORTE'], maxLength: 1400 },
    );
  }

  if (/Waterdeep - Le Donjon du Mage/i.test(sourceFile)) {
    entries.push(
      { name: 'Bouclier de la rune Uven', type: 'Armure', rarity: 'Rare', needles: ['BOUCLIER DE LA RUNE UVEN'], maxLength: 1300, armor: true },
      { name: 'Gouvernail du charognard', type: 'Objet merveilleux', rarity: 'Très rare', needles: ['GOUVERNAIL DU CHAROGNARD'], maxLength: 1300 },
    );
  }

  if (/Tonnerre/i.test(sourceFile)) {
    entries.push(
      { name: 'Conque de téléportation', type: 'Objet merveilleux', rarity: 'Rare', needles: ['CONQUE DE TÉLÉPORTATION', 'CONQUE DE TELEPORTATION'], maxLength: 1200 },
    );
  }

  if (/Reine Dragon/i.test(sourceFile)) {
    entries.push(
      { name: 'Masque de dragon noir', type: 'Objet merveilleux', rarity: 'Légendaire', needles: ['MASQUE DE DRAGON NOIR'], maxLength: 1600 },
    );
  }

  for (const entry of entries) {
    const index = findFirstNeedleIndex(text, entry.needles);
    if (index < 0) continue;
    const sourcePage = pageForIndex(text, index);
    const description = cleanMagicItemDescription(text.slice(index, Math.min(text.length, index + (entry.maxLength ?? 1200))));
    const source = formatItemSource(sourceName, sourceFile, sourcePage);

    if (entry.armor) {
      const baseArmor = normalizeBaseArmor(inferBaseArmorFromName(entry.name));
      const base = findBaseArmorData(baseArmor);
      addArmor(entry.name, {
        type: 'Magique',
        armorCategory: inferArmorCategory(baseArmor, entry.name),
        baseArmor,
        ac: base?.ac ?? '',
        strength: base?.strength ?? '',
        stealth: base?.stealth ?? '',
        price: '',
        weight: base?.weight ?? '',
        rarity: entry.rarity,
        bonus: parseWeaponBonus(entry.name),
        requiresAttunement: /harmonisation/i.test(description),
        description,
        sources: [source],
        sourceFile,
        sourcePage,
      }, [entry.type, entry.rarity].filter(Boolean).join(' · '), ['armure', 'magique', 'campagne', entry.rarity, sourceName], sourceName, license, quality);
    } else {
      addItem(entry.name, {
        type: entry.type,
        rarity: entry.rarity,
        price: '',
        weight: '',
        requiresAttunement: /harmonisation/i.test(description),
        description,
        sources: [source],
        sourceFile,
        sourcePage,
      }, [entry.type, entry.rarity].filter(Boolean).join(' · '), ['objet', 'magique', 'campagne', entry.type, entry.rarity, sourceName], sourceName, license, quality);
    }
  }
}

function findFirstNeedleIndex(text, needles) {
  const indexes = (needles ?? []).map((needle) => normalizedIndexOf(text, needle)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function parseGenericNpcProfiles(text, sourceFile, sourceName, license, quality, options = {}) {
  const startRe = /(?:^|\n)([A-ZÀ-ÖØ-Þa-zà-öø-ÿ0-9][^\n]{1,90})\n((?:Aberration|Bête|Céleste|Créature artificielle|Créature monstrueuse|Dragon|Élémentaire|Fée|Fiélon|Géant|Humanoïde|Mort-vivant|Plante|Vase|Nuée)[^\n]*?)\nClasse d[’']armure/gi;
  const starts = [];
  const seenVariants = new Set();
  let match;
  while ((match = startRe.exec(text))) {
    const name = cleanTitle(match[1]);
    if (!isLikelyCreatureName(name)) continue;
    starts.push({ index: match.index + (match[0].startsWith('\n') ? 1 : 0), name, typeLine: cleanText(match[2]) });
  }

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = starts[i + 1]?.index ?? text.length;
    const segment = text.slice(start.index, end).trim();
    const parsed = parseCreatureSegment(start.name, start.typeLine, segment);
    if (!parsed) continue;

    const sourcePage = pageForIndex(text, start.index);
    const baseName = cleanNpcProfileName(parsed.name);
    const baseKey = normalizeName(baseName);
    const isKnownNamedNpc = KNOWN_NAMED_NPC_KEYS.has(normalizeName(canonicalNpcName(baseName)));
    const group = options.disambiguateGroup ? inferNpcProfileGroup(text, start.index) : '';
    if (options.disambiguateGroup && !isKnownNamedNpc && CORE_AIDEDD_NPC_PROFILE_KEYS.has(baseKey) && isCoreNpcProfile(parsed.data)) continue;
    const variantKey = `${baseKey}:${normalizeName(group)}:${parsed.data.cr}:${normalizeName(parsed.data.type)}`;
    if (seenVariants.has(variantKey)) continue;
    seenVariants.add(variantKey);

    const displayName = options.disambiguateGroup && !isKnownNamedNpc
      ? disambiguatedNpcProfileName(baseName, group, parsed.data)
      : baseName;
    const role = [
      options.profileKind ?? 'Profil de PNJ',
      group && !displayName.includes(`(${group})`) ? group : '',
      parsed.data.cr ? `FP ${parsed.data.cr}` : '',
      parsed.data.type,
    ].filter(Boolean).join(' · ');
    const forcedKey = isKnownNamedNpc ? undefined : `${options.forceKeyPrefix ?? 'npc-profile'}:${normalizeName(group)}:${normalizeName(baseName)}:${sourcePage ?? i}`;

    addNpc(displayName, {
      campaign: '',
      role,
      sourceFile,
      sourcePage,
      description: npcProfileDescription(parsed.data),
    }, role, ['pnj', 'profil', group, parsed.data.type, parsed.data.cr ? `fp ${parsed.data.cr}` : '', sourceName], sourceName, license, quality, forcedKey);
  }
}

function parseNamedNpcSeeds(text, sourceFile, sourceName, license, quality) {
  const groups = NAMED_NPC_GROUPS.filter((group) => group.test.test(sourceFile));
  for (const group of groups) {
    for (const rawEntry of group.entries) {
      const entry = normalizeNpcSeed(rawEntry, group);
      const index = findNamedNpcIndex(text, entry);
      if (index < 0) continue;
      const sourcePage = pageForIndex(text, index);
      const description = linkCampaignText(extractNamedNpcDescription(text, index, entry), CAMPAIGNS[sourceFile], sourceFile);
      addNpc(entry.name, {
        campaign: entry.campaign,
        role: entry.role,
        sourceFile,
        sourcePage,
        description,
      }, `${entry.campaign} · ${entry.role}`, ['pnj', 'narratif', entry.campaign, entry.role, sourceName], sourceName, license, quality);
    }
  }
}

function normalizeNpcSeed(rawEntry, group) {
  const [name, role, needles = [name], minPage = 1] = rawEntry;
  return {
    name,
    role,
    needles,
    minPage,
    campaign: group.campaign,
    maxLength: 1200,
  };
}

function findNamedNpcIndex(text, entry) {
  const haystack = text.toLocaleUpperCase('fr');
  let fallback = -1;
  for (const needle of entry.needles) {
    const target = String(needle).toLocaleUpperCase('fr');
    let index = -1;
    while ((index = haystack.indexOf(target, index + 1)) >= 0) {
      if (fallback < 0) fallback = index;
      const page = pageForIndex(text, index) ?? 0;
      if (page >= entry.minPage && !isBadNpcSeedContext(text, index)) return index;
    }
  }
  return fallback;
}

function isBadNpcSeedContext(text, index) {
  const before = text.slice(Math.max(0, index - 180), index);
  return /SOMMAIRE|TABLE DES MATIÈRES|INDEX/i.test(before);
}

function extractNamedNpcDescription(text, index, entry) {
  const raw = text.slice(index, index + (entry.maxLength ?? 1200));
  const marker = raw.slice(80).search(/--\s*\d+\s+of\s+\d+\s*--/);
  const clipped = marker >= 0 ? raw.slice(0, marker + 80) : raw;
  const nameRe = new RegExp(`^${escapeRegExp(entry.name)}\\s*[-:.,]?\\s*`, 'i');
  return cleanText(clipped)
    .replace(nameRe, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function npcProfileDescription(data) {
  const lines = [
    data.ac ? `CA ${data.ac}` : '',
    data.hp ? `PV ${data.hp}${data.hitDice ? ` (${data.hitDice})` : ''}` : '',
    data.speed ? `Vitesse ${data.speed}` : '',
    data.senses ? `Sens ${data.senses}` : '',
    data.languages ? `Langues ${data.languages}` : '',
    data.description,
    data.actions?.length ? `Actions : ${data.actions.join(' ')}` : '',
    data.reactions?.length ? `Réactions : ${data.reactions.join(' ')}` : '',
  ].filter(Boolean);
  return cleanText(lines.join('\n\n'));
}

function inferNpcProfileGroup(text, index) {
  const lines = text.slice(Math.max(0, index - 2500), index).split('\n').map((line) => cleanTitle(line)).filter(Boolean).reverse();
  for (const line of lines) {
    if (line.length > 70) continue;
    if (/^(Classe d|Points de vie|Vitesse|FOR|DEX|CON|INT|SAG|CHA|Actions|RÃ©actions|Compétences|Langues|Sens|Facteur|Dangerosité|Compendium|Sommaire|\d+)/i.test(line)) continue;
    if (/^(Alliance des Seigneurs|Combattants|Criminels|Culte du dragon|Disciples|Drows|Duergars|Gith|Magiciens|Prêtres|Nobles|Villageois|Vistani|Zhentarim|Liste des|Créatures légendaires)/i.test(line)) return line;
  }
  return '';
}

function shouldDisambiguateNpcProfile(name) {
  return /^(Capitaine|Garde|Cultiste|Ensorceleur|Mage|Soldat|Sergent|Lieutenant|Archer|Berserk|Chevalier|Gladiateur|Guerrier|Vétéran|Assassin|Bandit|Espion|Prêtre|Noble|Druide|Éclaireur)$/i.test(cleanText(name));
}

function disambiguatedNpcProfileName(name, group, data) {
  const suffix = [
    group,
    data.cr ? `FP ${data.cr}` : '',
    npcProfileTypeSuffix(data.type),
  ].filter(Boolean).join(', ');
  if (!suffix) return name;
  return `${name} (${suffix})`;
}

function npcProfileTypeSuffix(type) {
  const cleaned = cleanText(type);
  if (!cleaned || /toute race/i.test(cleaned)) return '';
  return cleaned.replace(/^Humanoïde\s*/i, '').replace(/[()]/g, '').trim();
}

function isCoreNpcProfile(data) {
  return /toute race/i.test(data.type ?? '');
}

function cleanNpcProfileName(name) {
  return cleanTitle(name)
    .replace(/\s*\(?\s*FP\s*[\d/]+\s*\)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalNpcName(name) {
  const value = displayTitle(cleanText(name).replace(/\s+/g, ' '));
  const aliases = new Map([
    ['volo', 'Volothamp Geddarm'],
    ['madam-eva', 'Madame Éva'],
    ['madame-eva', 'Madame Éva'],
    ['ezmerelda-davenir', 'Esméralda d’Avenir'],
    ['ezmerelda-d-avenir', 'Esméralda d’Avenir'],
    ['esmeralda-davenir', 'Esméralda d’Avenir'],
    ['esmeralda-d-avenir', 'Esméralda d’Avenir'],
    ['rictavio', 'Rudolph van Richten'],
    ['dragonbait', 'Chair-à-dragon'],
    ['chair-a-dragon', 'Chair-à-dragon'],
    ['halaster-blackcloak', 'Halaster Sombrecape'],
    ['duc-ravengard', 'Ulder Ravengard'],
    ['duke-ravengard', 'Ulder Ravengard'],
    ['tarbaw-coteaunoir', 'Tarbaw CôteauNoir'],
    ['volothamp-volo-geddarm', 'Volothamp Geddarm'],
  ]);
  return aliases.get(normalizeName(value)) ?? value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseWeaponTables(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);
  const descriptions = extractSpecialWeaponDescriptions(text);
  parseBasicRulesWeaponTable(text, sourceFile, sourceName, license, quality, descriptions);
  parsePlayersHandbookWeaponTable(text, sourceFile, sourceName, license, Math.max(40, quality - 20), descriptions);
}

function parseBasicRulesWeaponTable(text, sourceFile, sourceName, license, quality, descriptions) {
  const start = text.indexOf('Arme Dégât Poids Prix Propriétés');
  if (start < 0) return;
  const end = firstPositiveIndex([
    text.indexOf('\nFinesse.', start),
    text.indexOf('\n-- 48 of', start),
  ], start + 6500);
  const page = pageForIndex(text, start);
  parseWeaponTableBlock(text.slice(start, end), {
    sourceFile,
    sourceName,
    license,
    quality,
    sourcePage: page,
    format: 'basic',
    descriptions,
  });
}

function parsePlayersHandbookWeaponTable(text, sourceFile, sourceName, license, quality, descriptions) {
  const start = text.indexOf('Nom Prix Dégâts Poids Propriétés');
  if (start < 0) return;
  const end = firstPositiveIndex([
    text.indexOf('\nÉQUIPEMENT D', start),
    text.indexOf('\n-- 149 of', start),
  ], start + 6500);
  const page = pageForIndex(text, start);
  parseWeaponTableBlock(text.slice(start, end), {
    sourceFile,
    sourceName,
    license,
    quality,
    sourcePage: page,
    format: 'phb',
    descriptions,
  });
}

function parseWeaponTableBlock(block, context) {
  let weaponCategory = '';
  let rangeType = '';

  for (const rawLine of block.split('\n')) {
    const line = normalizeWeaponLine(rawLine);
    if (!line || /^Nom Prix|^Arme Dégât|^WWW\.AIDEDD|^--/.test(line)) continue;

    const section = parseWeaponSection(line);
    if (section) {
      weaponCategory = section.weaponCategory;
      rangeType = section.rangeType;
      continue;
    }

    const parsed = context.format === 'phb'
      ? parsePhbWeaponLine(line)
      : parseBasicWeaponLine(line);
    if (!parsed) continue;

    const name = canonicalWeaponName(parsed.name);
    const properties = parseWeaponProperties(parsed.properties);
    const range = extractWeaponRange(properties);
    const description = context.descriptions.get(normalizeName(name)) ?? '';
    const damage = parsed.damageDice && parsed.damageType ? `${parsed.damageDice} ${parsed.damageType}` : '';
    const source = formatWeaponSource(context.sourceName, context.sourceFile, context.sourcePage);
    const summary = [
      weaponCategory,
      rangeType,
      damage || 'arme spéciale',
      range ? `portée ${range}` : '',
    ].filter(Boolean).join(' · ');

    addWeapon(name, {
      type: 'Standard',
      weaponCategory,
      rangeType,
      baseWeapon: '',
      damage,
      damageDice: parsed.damageDice,
      damageType: parsed.damageType,
      price: parsed.price,
      weight: parsed.weight,
      properties,
      range,
      rarity: '',
      bonus: '',
      requiresAttunement: false,
      description,
      sources: [source],
      sourceFile: context.sourceFile,
      sourcePage: context.sourcePage,
    }, summary, ['arme', 'standard', weaponCategory, rangeType, context.sourceName, ...properties], context.sourceName, context.license, context.quality);
  }
}

function parseWeaponSection(line) {
  if (/^Armes courantes de corps à corps/i.test(line) || /^Armes de corps à corps courantes/i.test(line)) {
    return { weaponCategory: 'Courante', rangeType: 'Corps à corps' };
  }
  if (/^Armes courantes à distance/i.test(line) || /^Armes à distance courantes/i.test(line)) {
    return { weaponCategory: 'Courante', rangeType: 'Distance' };
  }
  if (/^Armes de guerre de corps à corps/i.test(line) || /^Armes de corps à corps de guerre/i.test(line)) {
    return { weaponCategory: 'Guerre', rangeType: 'Corps à corps' };
  }
  if (/^Armes de guerre à distance/i.test(line) || /^Armes à distance de guerre/i.test(line)) {
    return { weaponCategory: 'Guerre', rangeType: 'Distance' };
  }
  return null;
}

function parseBasicWeaponLine(line) {
  const normalized = normalizeDiceText(line);
  const damage = normalized.match(/\b((?:\d+d\d+)|\d+)\s+(contondant|perforant|tranchant)\b/i);
  if (damage) {
    const name = normalized.slice(0, damage.index).trim();
    const rest = normalized.slice(damage.index + damage[0].length).trim();
    const details = rest.match(/^(-|[\d,.]+\s*(?:kg|g))\s+(-|[\d,.]+\s*(?:po|pa|pc))\s*(.*)$/i);
    if (!name || !details) return null;
    return {
      name,
      damageDice: normalizeDamageDice(damage[1]),
      damageType: damage[2].toLowerCase(),
      weight: normalizeWeaponNumber(details[1]),
      price: normalizeWeaponNumber(details[2]),
      properties: details[3],
    };
  }

  const special = normalized.match(/^(.+?)\s+(-|[\d,.]+\s*(?:kg|g))\s+(-|[\d,.]+\s*(?:po|pa|pc))\s*(.*)$/i);
  if (!special) return null;
  return {
    name: special[1],
    damageDice: '',
    damageType: '',
    weight: normalizeWeaponNumber(special[2]),
    price: normalizeWeaponNumber(special[3]),
    properties: special[4],
  };
}

function parsePhbWeaponLine(line) {
  const normalized = normalizeDiceText(line);
  const price = normalized.match(/\b(\d+\s*(?:po|pa|pc))\b/i);
  if (!price) return null;
  const name = normalized.slice(0, price.index).trim();
  const rest = normalized.slice(price.index + price[0].length).trim();
  if (!name || /^(Nom|Armes)/i.test(name)) return null;

  const damage = rest.match(/^((?:\d+d\d+)|\d+)\s+(contondant|perforant|tranchant)\s+(.+)$/i);
  if (damage) {
    const details = damage[3].match(/^(-|[\d,.]+\s*(?:kg|g))\s*(.*)$/i);
    if (!details) return null;
    return {
      name,
      damageDice: normalizeDamageDice(damage[1]),
      damageType: damage[2].toLowerCase(),
      price: normalizeWeaponNumber(price[1]),
      weight: normalizeWeaponNumber(details[1]),
      properties: details[2],
    };
  }

  const special = rest.match(/^(-|[\d,.]+\s*(?:kg|g))\s*(.*)$/i);
  if (!special) return null;
  return {
    name,
    damageDice: '',
    damageType: '',
    price: normalizeWeaponNumber(price[1]),
    weight: normalizeWeaponNumber(special[1]),
    properties: special[2],
  };
}

function parseMagicWeapons(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);
  const startRe = /(?:^|\n)([^\n]{2,100})\nArme\s*\(([^)\n]+)\)\s*,?\s*([^\n]*)/gi;
  const starts = [];
  let match;
  while ((match = startRe.exec(text))) {
    const rawName = cleanText(match[1]);
    if (!isLikelyMagicWeaponName(rawName)) continue;
    starts.push({
      index: match.index + (match[0].startsWith('\n') ? 1 : 0),
      contentStart: startRe.lastIndex,
      rawName,
      baseWeapon: cleanText(match[2]),
      meta: cleanText(match[3]),
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const nextWeapon = starts[i + 1]?.index ?? text.length;
    const hardEnd = Math.min(nextWeapon, start.contentStart + 3200);
    const end = findMagicWeaponDescriptionEnd(text, start.contentStart, hardEnd);
    const description = cleanMagicItemDescription(text.slice(start.contentStart, end));
    const name = canonicalWeaponName(start.rawName);
    const baseWeapon = normalizeBaseWeapon(start.baseWeapon);
    const requiresAttunement = /harmonisation|harmonis|lien|nécessite un/i.test(normalizeMagicText(`${start.meta}\n${description}`));
    const bonus = parseWeaponBonus(`${name}\n${start.meta}\n${description}`);
    let rarity = parseWeaponRarity(start.meta) || parseWeaponRarity(description);
    if (bonus.includes('/') && /(rare|commun|légendaire)/i.test(normalizeMagicText(start.meta))) rarity = 'Variable';
    const sourcePage = pageForIndex(text, start.index);
    const source = formatWeaponSource(sourceName, sourceFile, sourcePage);
    const base = findBaseWeaponData(baseWeapon);
    const summary = [baseWeapon, rarity || 'magique', bonus].filter(Boolean).join(' · ');

    addWeapon(name, {
      type: 'Magique',
      weaponCategory: 'Magique',
      rangeType: base?.rangeType ?? inferRangeTypeFromBaseWeapon(baseWeapon),
      baseWeapon,
      damage: base?.damage ?? '',
      damageDice: base?.damageDice ?? '',
      damageType: base?.damageType ?? '',
      price: '',
      weight: base?.weight ?? '',
      properties: base?.properties ?? [],
      range: base?.range ?? '',
      rarity,
      bonus,
      requiresAttunement,
      description,
      sources: [source],
      sourceFile,
      sourcePage,
    }, summary, ['arme', 'magique', rarity, bonus, baseWeapon, sourceName], sourceName, license, quality);
  }
}

function parseRemainingWeaponMentions(fullText, sourceFile, sourceName, license, quality) {
  const text = normalizePdfText(fullText);
  if (/La Tombe de l'Annihilation/i.test(sourceFile)) {
    addTombOfAnnihilationWeapons(text, sourceFile, sourceName, license, quality);
  }
  if (/Waterdeep - Le Donjon du Mage/i.test(sourceFile)) {
    addDungeonOfTheMadMageWeapons(text, sourceFile, sourceName, license, quality);
  }
  if (/Guide Complet de Xanathar/i.test(sourceFile)) {
    addXanatharWeaponReferences(text, sourceFile, sourceName, license, quality);
  }
  if (/Baldur/i.test(sourceFile)) {
    addBaldursGateHeroWeapons(text, sourceFile, sourceName, license, quality);
  }
  if (/Le Trésor de la Reine Dragon|Le Trésor de la Reine Dragon/i.test(sourceFile)) {
    addHoardOfTheDragonQueenWeaponMentions(text, sourceFile, sourceName, license, quality);
  }
  if (/Guide du mai|Guide du ma/i.test(sourceFile)) {
    addDungeonMastersGuideWeapons(text, sourceFile, sourceName, license, Math.max(quality, 85));
  }
  if (/Strahd/i.test(sourceFile)) {
    addCurseOfStrahdWeapons(text, sourceFile, sourceName, license, Math.max(quality, 85));
  }
}

function addDungeonMastersGuideWeapons(text, sourceFile, sourceName, license, quality) {
  const entries = [
    { name: 'Arc du serment', baseWeapon: 'Arc long', rarity: 'Très rare', requiresAttunement: true, needles: ['ARC DU SERMENT'], maxLength: 1700 },
    { name: 'Arme +1/+2/+3', baseWeapon: 'Toute arme', rarity: 'Variable', bonus: '+1/+2/+3', needles: ['ARME +1, +2 OU +3'], maxLength: 520 },
    { name: 'Arme vicieuse', baseWeapon: 'Toute arme', rarity: 'Rare', needles: ['ARME VICIEUSE'], maxLength: 430 },
    { name: 'Arme vigilante', baseWeapon: 'Toute arme', rarity: 'Peu commun', requiresAttunement: true, needles: ['ARME VIGILANTE'], maxLength: 850, stopNeedles: ['ARMURE +1'] },
    { name: 'Cimeterre de célérité', baseWeapon: 'Cimeterre', rarity: 'Très rare', bonus: '+2', requiresAttunement: true, needles: ['CIMETERRE DE CÉLÉRITÉ'], maxLength: 620 },
    { name: 'Dague de Venin', baseWeapon: 'Dague', rarity: 'Rare', bonus: '+1', needles: ['DAGUE VENIMEUSE'], maxLength: 760 },
    { name: 'Épée ardente', baseWeapon: 'Épée', rarity: 'Rare', requiresAttunement: true, needles: ['EPÉE ARDENTE'], maxLength: 720 },
    { name: 'Épée dansante', baseWeapon: 'Épée', rarity: 'Très rare', requiresAttunement: true, needles: ['EPÉE DANSANTE'], maxLength: 860 },
    { name: 'Épée de réponse', baseWeapon: 'Épée longue', rarity: 'Légendaire', requiresAttunement: true, needles: ['EPÉE DE RÉPONSE'], maxLength: 1700 },
    { name: 'Épée mordante', baseWeapon: 'Épée', rarity: 'Rare', requiresAttunement: true, needles: ['EPÉE MORDANTE'], maxLength: 980 },
    { name: 'Épée radieuse', baseWeapon: 'Épée longue', rarity: 'Rare', bonus: '+2', requiresAttunement: true, needles: ['EPÉE RADIEUSE'], maxLength: 960 },
    { name: 'Épée tranchante', baseWeapon: 'Épée', rarity: 'Très rare', requiresAttunement: true, needles: ['EPÉE TRANCHANTE'], maxLength: 1150 },
    { name: 'Épée voleuse de vie', baseWeapon: 'Épée', rarity: 'Rare', requiresAttunement: true, needles: ['EPÉE VOLEUSE DE VIE'], maxLength: 620 },
    { name: 'Épée vorpale', baseWeapon: 'Épée', rarity: 'Légendaire', bonus: '+3', requiresAttunement: true, needles: ['EPÉE VORPALE'], maxLength: 1000 },
    { name: 'Fer gelé', baseWeapon: 'Épée', rarity: 'Très rare', requiresAttunement: true, needles: ['FER GELÉ'], maxLength: 860 },
    { name: 'Flèche tueuse', baseWeapon: 'Flèche', rarity: 'Très rare', needles: ['FLÈCHE TUEUSE'], maxLength: 900, tags: ['munition'] },
    { name: 'Hache du berserker', baseWeapon: 'Hache', rarity: 'Rare', bonus: '+1', requiresAttunement: true, needles: ['HACHE DU BERSERKER'], maxLength: 1250 },
    { name: 'Javeline de foudre', baseWeapon: 'Javeline', rarity: 'Peu commun', needles: ['JAVELINE DE FOUDRE'], maxLength: 1050 },
    { name: 'Lame porte-bonheur', baseWeapon: 'Épée', rarity: 'Légendaire', bonus: '+1', requiresAttunement: true, needles: ['LAME PORTE-BONHEUR'], maxLength: 1250 },
    { name: 'Marteau de lancer nain', baseWeapon: 'Marteau de guerre', rarity: 'Très rare', bonus: '+3', requiresAttunement: true, needles: ['MARTEAU DE LANCER NAIN'], maxLength: 880 },
    { name: 'Marteau du tonnerre', baseWeapon: 'Maillet', rarity: 'Légendaire', bonus: '+1', needles: ['MARTEAU DU TONNERRE'], maxLength: 1050 },
    { name: 'Masse d’anéantissement', baseWeapon: 'Masse d’armes', rarity: 'Rare', requiresAttunement: true, needles: ["MASSE D'ANÉANTISSEMENT"], maxLength: 700 },
    { name: 'Masse destructrice', baseWeapon: 'Masse d’armes', rarity: 'Rare', bonus: '+1', needles: ['MASSE DESTRUCTRICE'], maxLength: 650 },
    { name: 'Masse terrifiante', baseWeapon: 'Masse d’armes', rarity: 'Rare', requiresAttunement: true, needles: ['MASSE TERRIFIANTE'], maxLength: 980 },
    { name: 'Munition +1/+2/+3', baseWeapon: 'Toute munition', rarity: 'Variable', bonus: '+1/+2/+3', needles: ['MUNITION +1, +2 OU +3'], maxLength: 520, tags: ['munition'] },
    { name: 'Protectrice', baseWeapon: 'Épée', rarity: 'Légendaire', bonus: '+3', requiresAttunement: true, needles: ['PROTECTRICE'], maxLength: 880 },
    { name: 'Trident de domination aquatique', baseWeapon: 'Trident', rarity: 'Peu commun', requiresAttunement: true, needles: ['TRIDENT DE DOMINATION AQUATIQUE'], maxLength: 720 },
    { name: 'Tueuse de dragon', baseWeapon: 'Épée', rarity: 'Rare', bonus: '+1', needles: ['TÙEUSE DE DRAGON', 'TUEUSE DE DRAGON'], maxLength: 780 },
    { name: 'Tueuse de géant', baseWeapon: 'Hache ou épée', rarity: 'Rare', bonus: '+1', needles: ['TUEUSE DE GÉANT'], maxLength: 780 },
    { name: 'Vengeresse sacrée', baseWeapon: 'Épée', rarity: 'Légendaire', bonus: '+3', requiresAttunement: true, needles: ['VENGERESSE SACRÉE'], maxLength: 950 },
    { name: 'Voleuse de vies', baseWeapon: 'Épée', rarity: 'Très rare', bonus: '+2', requiresAttunement: true, needles: ['VOLEUSE DE VIES'], maxLength: 900 },
  ];

  addOcrMagicWeaponEntries(text, entries, sourceFile, sourceName, license, quality);
}

function addCurseOfStrahdWeapons(text, sourceFile, sourceName, license, quality) {
  const entries = [
    { name: 'Épée courte +1 intelligente', baseWeapon: 'Épée courte', rarity: 'Peu commun', bonus: '+1', needles: ['ÉPÉE COURTE +1 INTELLIGENTE'], requireWeaponBlock: false, maxLength: 1050 },
    { name: 'Lame porte-bonheur', baseWeapon: 'Épée', rarity: 'Légendaire', bonus: '+1', requiresAttunement: true, needles: ['LAME PORTE-BONHEUR'], requireWeaponBlock: false, maxLength: 620 },
    { name: 'Hache de Gulthias', baseWeapon: 'Hache d’armes', rarity: '', needles: ["HACHE D'ARMES MAGIQUE", 'HACHE PLANTÉE'], requireWeaponBlock: false, maxLength: 950 },
    { name: 'Épée solaire', baseWeapon: 'Épée longue', rarity: 'Légendaire', requiresAttunement: true, needles: ['ÉPÉE SOLAIRE'], maxLength: 1550 },
    { name: 'Fémur de sainte Markovia', baseWeapon: 'Masse d’armes', rarity: 'Rare', requiresAttunement: true, needles: ['FÉMUR DE SAINTE MARKOVIA'], maxLength: 1100 },
    { name: 'Lance de sang', baseWeapon: 'Lance', rarity: 'Peu commun', bonus: '+2', requiresAttunement: true, needles: ['LANCE DE SANG'], maxLength: 850 },
  ];

  addOcrMagicWeaponEntries(text, entries, sourceFile, sourceName, license, quality);
}

function addOcrMagicWeaponEntries(text, entries, sourceFile, sourceName, license, quality) {
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const nextNeedles = entries[i + 1]?.needles ?? [];
    const index = findOcrWeaponEntryIndex(text, entry);
    const sourcePage = pageForIndex(text, index);
    const description = extractOcrWeaponEntryDescription(text, index, [
      ...nextNeedles,
      ...(entry.stopNeedles ?? []),
    ], entry.maxLength ?? 1000);

    addMagicWeaponEntry(entry.name, {
      baseWeapon: entry.baseWeapon,
      rarity: entry.rarity,
      bonus: entry.bonus ?? '',
      requiresAttunement: entry.requiresAttunement ?? /harmonisation requise/i.test(description),
      description,
      sourceFile,
      sourceName,
      sourcePage,
      license,
      quality,
      tags: entry.tags ?? [],
    });
  }
}

function findOcrWeaponEntryIndex(text, entry) {
  const haystack = text.toLocaleUpperCase('fr');
  let fallback = -1;

  for (const needle of entry.needles ?? [entry.name]) {
    const target = needle.toLocaleUpperCase('fr');
    let index = -1;
    while ((index = haystack.indexOf(target, index + 1)) >= 0) {
      if (fallback < 0) fallback = index;
      if (entry.requireWeaponBlock === false) return index;
      if (/Arme\s*\(/i.test(text.slice(index, index + 180))) return index;
    }
  }

  return fallback;
}

function extractOcrWeaponEntryDescription(text, index, stopNeedles, maxLength) {
  if (index < 0) return '';
  const raw = text.slice(index, index + maxLength);
  const upper = raw.toLocaleUpperCase('fr');
  let end = raw.length;

  for (const needle of stopNeedles) {
    const stop = upper.indexOf(needle.toLocaleUpperCase('fr'), 40);
    if (stop > 0) end = Math.min(end, stop);
  }

  return cleanOcrWeaponDescription(raw.slice(0, end));
}

function cleanOcrWeaponDescription(text) {
  const cleaned = cleanMagicItemDescription(text);
  const meta = cleaned.match(/Arme\s*\([^)]+\)\s*,?\s*[\s\S]{0,160}?(?=\b(?:Vous|Quand|Cette|Ce|Une|L['’]|Le|Les|Si|Dans|Tant|Sous|Kavan|Il)\b)/i);
  if (meta) return cleanMagicItemDescription(cleaned.slice(meta.index + meta[0].length));
  return cleaned;
}

function addTombOfAnnihilationWeapons(text, sourceFile, sourceName, license, quality) {
  const yklwaIndex = normalizedIndexOf(text, 'LYKLWA');
  const yklwaPage = pageForIndex(text, yklwaIndex);
  const yklwaDescription = excerptBetween(text, yklwaIndex, ['LES COURSES DE DINOSAURES'], 1400)
    .replace(/^LYKLWA\s*/i, '');

  addWeapon('Yklwa', {
    type: 'Standard',
    weaponCategory: 'Courante',
    rangeType: 'Corps à corps',
    baseWeapon: '',
    damage: '1d8 perforant',
    damageDice: '1d8',
    damageType: 'perforant',
    price: '1 po',
    weight: '',
    properties: ['lancer (portée 3 m/9 m)'],
    range: '3 m/9 m',
    rarity: '',
    bonus: '',
    requiresAttunement: false,
    description: yklwaDescription,
    sources: [formatWeaponSource(sourceName, sourceFile, yklwaPage)],
    sourceFile,
    sourcePage: yklwaPage,
  }, 'Courante · Corps à corps · 1d8 perforant · portée 3 m/9 m', ['arme', 'standard', 'courante', 'corps à corps', 'lancer', sourceName], sourceName, license, quality + 10);

  const marketIndex = normalizedIndexOf(text, 'BOUCLIERS ET ARMES MAGIQUES A VENDRE');
  const marketPage = pageForIndex(text, marketIndex);
  const marketDescription = cleanText(excerptBetween(text, marketIndex, ['IFAN TALRO'], 1200));
  addMagicWeaponEntry('Dague +1', {
    baseWeapon: 'Dague',
    rarity: 'Peu commun',
    bonus: '+1',
    description: marketDescription,
    sourceFile,
    sourceName,
    sourcePage: marketPage,
    license,
    quality,
  });
  addMagicWeaponEntry('Yklwa +1', {
    baseWeapon: 'Yklwa',
    rarity: 'Peu commun',
    bonus: '+1',
    description: marketDescription,
    sourceFile,
    sourceName,
    sourcePage: marketPage,
    license,
    quality,
  });
  addMagicWeaponEntry('Munition +1/+2/+3', {
    baseWeapon: 'Toute munition',
    rarity: 'Variable',
    bonus: '+1/+2/+3',
    description: marketDescription,
    sourceFile,
    sourceName,
    sourcePage: marketPage,
    license,
    quality,
    tags: ['munition'],
  });

  const devlinIndex = normalizedIndexOf(text, 'Le bâton de Devlin est un bâton de combat');
  addMagicWeaponEntry('Bâton de Devlin', {
    baseWeapon: 'Bâton',
    rarity: 'Très rare',
    bonus: '+3',
    requiresAttunement: true,
    description: excerptBetween(text, devlinIndex, ['20. LA TOMBE FACTICE'], 1700),
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, devlinIndex),
    license,
    quality,
  });

  const forgottenIndex = normalizedIndexOf(text, "BÂTON DE L'");
  addMagicWeaponEntry('Bâton de l’Oublié', {
    baseWeapon: 'Bâton',
    rarity: 'Artefact',
    bonus: '+3',
    requiresAttunement: true,
    description: excerptBetween(text, forgottenIndex, ['TALISMAN DE LA SPHÈRE', 'ANNEXE D'], 3600),
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, forgottenIndex),
    license,
    quality: quality + 5,
  });
}

function addDungeonOfTheMadMageWeapons(text, sourceFile, sourceName, license, quality) {
  let tearulaiIndex = normalizedIndexOf(text, "L'épée longue, Tearulaï");
  if (tearulaiIndex < 0) {
    tearulaiIndex = normalizedIndexOf(text, 'TEARULAÏ', Math.max(0, normalizedIndexOf(text, 'LE DRAGON VERT')));
  }
  addMagicWeaponEntry('Tearulaï', {
    baseWeapon: 'Épée longue',
    rarity: 'Très rare',
    requiresAttunement: true,
    description: excerptBetween(text, tearulaiIndex, ['10. LE PONT DE PIERRE'], 2800),
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, tearulaiIndex),
    license,
    quality: quality + 10,
    tags: ['arme intelligente'],
  });

  const uvenIndex = normalizedIndexOf(text, 'Don de la vengeance');
  addMagicWeaponEntry('Arme de vengeance de la rune Uven', {
    baseWeapon: 'Toute arme',
    rarity: 'Rare',
    bonus: '+1/+3',
    requiresAttunement: true,
    description: excerptBetween(text, uvenIndex, ['LA STATUE'], 1400),
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, uvenIndex),
    license,
    quality,
    tags: ['rune uven'],
  });
}

function addBaldursGateHeroWeapons(text, sourceFile, sourceName, license, quality) {
  const viconiaIndex = normalizedIndexOf(text, 'Masse +2. Attaque');
  addMagicWeaponEntry('Masse +2', {
    baseWeapon: 'Masse d’armes',
    rarity: 'Rare',
    bonus: '+2',
    description: excerptBetween(text, viconiaIndex, ['Valas fut transformé'], 900),
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, viconiaIndex),
    license,
    quality,
  });

  const montaronIndex = normalizedIndexOf(text, 'épée courte +1');
  addMagicWeaponEntry('Épée courte +1', {
    baseWeapon: 'Épée courte',
    rarity: 'Peu commun',
    bonus: '+1',
    description: excerptBetween(text, montaronIndex, ['MA LAME DOIT'], 900),
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, montaronIndex),
    license,
    quality,
  });
}

function addHoardOfTheDragonQueenWeaponMentions(text, sourceFile, sourceName, license, quality) {
  const treasureIndex = normalizedIndexOf(text, 'arc long +1');
  const paragraphStart = normalizedIndexOf(text, 'Le trésor comprend', Math.max(0, treasureIndex - 900));
  const description = excerptBetween(text, paragraphStart >= 0 ? paragraphStart : Math.max(0, treasureIndex - 520), ['Développements'], 1200);
  addMagicWeaponEntry('Épée longue +1', {
    baseWeapon: 'Épée longue',
    rarity: 'Peu commun',
    bonus: '+1',
    description,
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, treasureIndex),
    license,
    quality,
  });
  addMagicWeaponEntry('Arc long +1', {
    baseWeapon: 'Arc long',
    rarity: 'Peu commun',
    bonus: '+1',
    description,
    sourceFile,
    sourceName,
    sourcePage: pageForIndex(text, treasureIndex),
    license,
    quality,
  });
}

function addXanatharWeaponReferences(text, sourceFile, sourceName, license, quality) {
  const refs = [
    ['Munition +1/+2/+3', 'Toute munition', 'Variable', '+1/+2/+3', false, ['munition']],
    ['Flèche tueuse', 'Flèche', 'Très rare', '', false, ['munition']],
    ['Javeline de foudre', 'Javeline', 'Peu commun', '', false],
    ['Arme +1/+2/+3', 'Toute arme', 'Variable', '+1/+2/+3', false],
    ['Arme vigilante', 'Toute arme', 'Peu commun', '', true],
    ['Trident de domination aquatique', 'Trident', 'Peu commun', '', true],
    ['Arme vicieuse', 'Toute arme', 'Rare', '', false],
    ['Dague venimeuse', 'Dague', 'Rare', '+1', false],
    ['Épée ardente', 'Épée', 'Rare', '', true],
    ['Épée mordante', 'Épée', 'Rare', '', true],
    ['Épée radieuse', 'Épée', 'Rare', '', true],
    ['Épée voleuse de vie', 'Épée', 'Rare', '', true],
    ['Hache du berserker', 'Hache d’armes', 'Rare', '+1', true],
    ['Masse d’anéantissement', 'Masse d’armes', 'Rare', '', true],
    ['Masse destructrice', 'Masse d’armes', 'Rare', '', false],
    ['Masse terrifiante', 'Masse d’armes', 'Rare', '', true],
    ['Tueuse de dragon', 'Épée', 'Rare', '', false],
    ['Tueuse de géant', 'Hache ou épée', 'Rare', '', false],
    ['Arc du serment', 'Arc long', 'Très rare', '', true],
    ['Cimeterre de célérité', 'Cimeterre', 'Très rare', '+2', true],
    ['Épée dansante', 'Épée', 'Très rare', '', true],
    ['Épée tranchante', 'Épée', 'Très rare', '', true],
    ['Fer gelé', 'Toute arme', 'Très rare', '', true],
    ['Marteau de lancer nain', 'Marteau de guerre', 'Très rare', '+3', true],
    ['Voleuse de vies', 'Épée', 'Très rare', '', true],
    ['Épée de réponse', 'Épée longue', 'Légendaire', '+3', true],
    ['Épée vorpale', 'Épée', 'Légendaire', '+3', true],
    ['Lame porte-bonheur', 'Épée', 'Légendaire', '+1', true],
    ['Marteau du tonnerre', 'Maillet', 'Légendaire', '+1', true],
    ['Protectrice', 'Épée', 'Légendaire', '+3', true],
    ['Vengeresse sacrée', 'Épée', 'Légendaire', '+3', true],
  ];

  for (const [name, baseWeapon, rarity, bonus, requiresAttunement, extraTags = []] of refs) {
    const index = xanatharWeaponRefIndex(text, name);
    const sourcePage = pageForIndex(text, index);
    addMagicWeaponEntry(name, {
      baseWeapon,
      rarity,
      bonus,
      requiresAttunement,
      description: `Référence issue des tables d'objets magiques de ${sourceName}. Le PDF liste cet objet comme une arme${requiresAttunement ? ' avec harmonisation' : ''}.`,
      sourceFile,
      sourceName,
      sourcePage,
      license,
      quality: Math.max(45, quality - 15),
      tags: ['table d’objets magiques', ...extraTags],
    });
  }
}

function xanatharWeaponRefIndex(text, name) {
  const fallbacks = {
    'Arme +1/+2/+3': ['Arme+l', 'Arme+1', 'Arme+2', 'Arme +3'],
    'Munition +1/+2/+3': ['Munition +l', 'Munition +1', 'Munition +2', 'Munition +3'],
  }[name] ?? [name];
  const indexes = fallbacks.map((needle) => normalizedIndexOf(text, needle)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function addMagicWeaponEntry(name, options) {
  if (!options.sourcePage && options.sourcePage !== null) options.sourcePage = null;
  const baseWeapon = normalizeBaseWeapon(options.baseWeapon ?? '');
  const base = findBaseWeaponData(baseWeapon);
  const source = formatWeaponSource(options.sourceName, options.sourceFile, options.sourcePage);
  const summary = [baseWeapon, options.rarity || 'Magique', options.bonus].filter(Boolean).join(' · ');
  addWeapon(name, {
    type: 'Magique',
    weaponCategory: 'Magique',
    rangeType: base?.rangeType ?? inferRangeTypeFromBaseWeapon(baseWeapon),
    baseWeapon,
    damage: base?.damage ?? '',
    damageDice: base?.damageDice ?? '',
    damageType: base?.damageType ?? '',
    price: '',
    weight: base?.weight ?? '',
    properties: base?.properties ?? [],
    range: base?.range ?? '',
    rarity: options.rarity ?? '',
    bonus: options.bonus ?? '',
    requiresAttunement: Boolean(options.requiresAttunement),
    description: cleanText(options.description ?? ''),
    sources: [source],
    sourceFile: options.sourceFile,
    sourcePage: options.sourcePage,
  }, summary, ['arme', 'magique', options.rarity, options.bonus, baseWeapon, options.sourceName, ...(options.tags ?? [])], options.sourceName, options.license, options.quality ?? 50);
}

function findBaseWeaponData(baseWeapon) {
  const key = `weapon:${normalizeName(canonicalWeaponName(baseWeapon))}`;
  const row = entitiesByKey.get(key);
  if (!row || row.categoryId !== CAT.weapon) return null;
  return row.data;
}

function inferRangeTypeFromBaseWeapon(baseWeapon) {
  const text = normalizeName(baseWeapon);
  if (/munition|fl[eè]che|carreau|bille/.test(text)) return 'Munition';
  if (/arc|arbalete|sarbacane|fronde/.test(text)) return 'Distance';
  return '';
}

function isLikelyMagicWeaponName(name) {
  if (!name || name.length > 90) return false;
  if (/^(Attaque|Action|Actions|Réaction|Description|Source|Armes?|Armure|Objet merveilleux|Potion|Anneau)$/i.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  return true;
}

function findMagicWeaponDescriptionEnd(text, start, hardEnd) {
  const tail = text.slice(start, hardEnd);
  const stops = [
    tail.search(/\n(?:ANNEXE[^\n]*|APPENDICE[^\n]*|CHAPITRE[^\n]*)/i),
    tail.search(/\n[^\n]{2,100}\n(?:Arme|Armure|Arm\s+Objet merveilleux|Objet merveilleux|Potion|Anneau|Baguette|Bâton|Sceptre|Parchemin|Bouclier|Bottes|Cape|Casque|Gemme|Livre|Grimoire|Pierre|Sac)\s*(?:\(|,)/i),
  ].filter((index) => index >= 0);
  return stops.length ? start + Math.min(...stops) : hardEnd;
}

function cleanMagicItemDescription(text) {
  return cleanText(text)
    .replace(/^\(?\s*(?:harmonisation requise|harmonisation|lien)\)?\s*/i, '')
    .split('\n')
    .filter((line) => !/^(CHAPITRE|APPENDICE|ANNEXE|\d+\s*$)/i.test(cleanText(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSpecialWeaponDescriptions(text) {
  const descriptions = new Map();
  const blockStart = text.indexOf('ARMES SPÉCIALES');
  if (blockStart < 0) return descriptions;
  const blockEnd = firstPositiveIndex([
    text.indexOf('\nARMURES', blockStart),
    text.indexOf('\n-- 50 of', blockStart),
  ], blockStart + 2600);
  const block = text.slice(blockStart, blockEnd);
  const entries = [
    ['Filet', /Filet\.\s*([\s\S]*?)(?=\nLance d['’]arçon\.|\nARMURES|$)/i],
    ['Lance d’arçon', /Lance d['’]arçon\.\s*([\s\S]*?)(?=\nARMURES|$)/i],
  ];
  for (const [name, re] of entries) {
    const body = cleanText(block.match(re)?.[1] ?? '');
    if (body) descriptions.set(normalizeName(name), body);
  }
  return descriptions;
}

function formatWeaponSource(sourceName, sourceFile, sourcePage) {
  return `${sourceName}${sourcePage ? ` p. ${sourcePage}` : ''} (${sourceFile})`;
}

function formatItemSource(sourceName, sourceFile, sourcePage) {
  if (!sourceName && !sourceFile) return '';
  return `${sourceName || sourceFile}${sourcePage ? ` p. ${sourcePage}` : ''}${sourceFile ? ` (${sourceFile})` : ''}`;
}

function canonicalArmorName(name) {
  let value = displayTitle(cleanMagicItemName(name)
    .replace(/\b\+8\b/g, '+3')
    .replace(/\bJourde\b/gi, 'lourde')
    .replace(/\blééère\b/gi, 'légère')
    .replace(/\s+/g, ' '));
  const key = normalizeName(value);
  const aliases = new Map([
    ['armure-1-2-ou-8', 'Armure +1/+2/+3'],
    ['armure-1-2-ou-3', 'Armure +1/+2/+3'],
    ['armure-1-2-3', 'Armure +1/+2/+3'],
    ['2-ou-8', 'Armure +1/+2/+3'],
    ['2-ou-3', 'Armure +1/+2/+3'],
    ['armure-en-adamantium', 'Armure d’adamantium'],
    ['armure-dadamantium', 'Armure d’adamantium'],
    ['armure-oe-resistance-au-froio-armure-dinvulnerabilite', 'Armure d’invulnérabilité'],
    ['armure-de-resistance-au-froid-armure-dinvulnerabilite', 'Armure d’invulnérabilité'],
    ['cuir-cloutee-glamour', 'Armure de cuir cloutée glamour'],
    ['cuir-cloute-glamour', 'Armure de cuir cloutée glamour'],
    ['harnois-nain-havresac-magique-ohevaro-harnois-ethere', 'Harnois éthéré'],
    ['bouclier-1', 'Bouclier +1'],
    ['bouclier-2', 'Bouclier +2'],
    ['bouclier-3', 'Bouclier +3'],
  ]);
  return aliases.get(key) ?? value;
}

function canonicalItemName(name) {
  let value = displayTitle(cleanMagicItemName(name)
    .replace(/\bOE\b/g, 'de')
    .replace(/\bloun\b/gi, 'Ioun')
    .replace(/\bHévard\b/gi, 'Heward')
    .replace(/\s+/g, ' '));
  const key = normalizeName(value);
  const aliases = new Map([
    ['antidetection', 'Amulette d’antidétection'],
    ['sort-anneau-de-resistance', 'Anneau de résistance'],
    ['es-tresors-baguette-de-metamorphose', 'Baguette de métamorphose'],
    ['baguette-de-metamorphose', 'Baguette de métamorphose'],
    ['ee-ardente-elixir-de-sante', 'Élixir de santé'],
    ['elixir-de-sante', 'Élixir de santé'],
    ['fer', 'Flasque de fer'],
    ['flasque-de-fer', 'Flasque de fer'],
    ['menottes-dimensionnelles-oeil-de-lynx-miroir-demprisonnement', 'Miroir d’emprisonnement'],
    ['menottes-dimensionnelles-il-de-lynx-miroir-demprisonnement', 'Miroir d’emprisonnement'],
    ['miroir-demprisonnement', 'Miroir d’emprisonnement'],
    ['p0t10n-de-clairvoyance', 'Potion de clairvoyance'],
    ['potion-de-clairvoyance', 'Potion de clairvoyance'],
    ['potion-de-soins', 'Potion de soins'],
    ['potions-de-soins', 'Potion de soins'],
    ['sac-sans-fond', 'Sac sans fond'],
    ['alish-selle-du-cavalier', 'Selle du cavalier'],
    ['selle-du-cavalier', 'Selle du cavalier'],
    ['havresac-magique-d-hevard', 'Havresac magique d’Heward'],
    ['havresac-magique-dheward', 'Havresac magique d’Heward'],
    ['havresac-magique-d-heward', 'Havresac magique d’Heward'],
    ['havresac-magique-dheward', 'Havresac magique d’Heward'],
    ['sphere', 'Talisman de la sphère'],
    ['talisman-de-la-sphere', 'Talisman de la sphère'],
    ['pierre-de-loun', 'Pierre de Ioun'],
    ['pierre-de-ioun', 'Pierre de Ioun'],
    ['ceil-artificiel', 'Œil artificiel'],
    ['oeil-artificiel', 'Œil artificiel'],
    ['urbe-boussole', 'Orbe boussole'],
    ['orbe-boussole', 'Orbe boussole'],
    ['urbe-horloge', 'Orbe horloge'],
    ['orbe-horloge', 'Orbe horloge'],
    ['o-corde-descalade', 'Corde d’escalade'],
  ]);
  return aliases.get(key) ?? value;
}

function cleanMagicItemName(name) {
  let value = cleanTitle(name)
    .replace(/[{}]/g, '')
    .replace(/^O-\s+/i, '')
    .replace(/^O\s+(?=CORDE|CUBE|DAGUE|ELIXIR|ÉPÉE|EVENTAIL|FER|FERS|FIGURINE|FILTRE|FLASQUE|FLÈCHE|FLÛTE|FORTERESSE|GANTELETS|GANTS|GEMME|GLOBE|HACHE|HARNOIS|HAVRESAC|HEAUME|HUILE|INSTRUMENTS)\b/i, '')
    .replace(/^(?:0N|ON)\s+(?=ANNEAU|ARMURE|BAGUETTE|BÂTON|BOTTES|BOUCLIER|CAPE|COTTE|HARNOIS|HAVRESAC)\b/i, '')
    .replace(/\s+\d{1,3}$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const itemWords = [
    'AILES', 'AMULETTE', 'ANNEAU', 'ARC', 'ARME', 'ARMURE', 'BAGUETTE', 'BALAI', 'BANDEAU', 'BATEAU',
    'BÂTON', 'BAUME', 'BOL', 'BOTTES', 'BOUCLIER', 'BOULE', 'BOUTEILLE', 'BRACELETS', 'BRASÉRO',
    'BROCHE', 'CAPE', 'CAPUCHON', 'CARAFE', 'CARILLON', 'CARQUOIS', 'CARTES', 'CEINTURON',
    'CHAPEAU', 'CHAPELET', 'CHEMISE', 'CHAUSSONS', 'CIERGE', 'COLLE', 'COLLIER', 'COR', 'CORDE',
    'COTTE', 'CRUCHE', 'CUBE', 'DAGUE', 'DIADÈME', 'ELIXIR', 'ÉLIXIR', 'ENCENSOIR', 'ÉPÉE',
    'EVENTAIL', 'ÉVENTAIL', 'FER', 'FERS', 'FIGURINE', 'FILTRE', 'FLASQUE', 'FLÈCHE', 'FLÛTE',
    'FORTERESSE', 'GANTELETS', 'GANTS', 'GEMME', 'GLOBE', 'HACHE', 'HARNOIS', 'HAVRESAC',
    'HEAUME', 'HUILE', 'INSTRUMENTS', 'JAVELINE', 'LAME', 'LANTERNE', 'LIVRE', 'LUNETTES',
    'MANTEAU', 'MANUEL', 'MARTEAU', 'MASQUE', 'MÉDAILLON', 'MIROIR', 'PERLE', 'PIERRE', 'POTION',
    'PUITS', 'SAC', 'SCEPTRE', 'SPHÈRE', 'TALISMAN', 'TAPIS', 'TOME',
  ];
  const keywordRe = new RegExp(`\\b(${itemWords.join('|')})\\b`, 'gi');
  const matches = [...value.matchAll(keywordRe)];
  if (matches.length > 1) value = value.slice(matches[matches.length - 1].index).trim();
  return value;
}

function isLikelyMagicItemName(name) {
  if (!name || name.length < 3 || name.length > 90) return false;
  if (/^\d+$/.test(name)) return false;
  if (/^\d/.test(name)) return false;
  if (/^\d+\s+OU\s+\+\d/i.test(name) || /^\+\d/.test(name)) return false;
  if (/[.!?]$/.test(name)) return false;
  if (/^(Cette?|Ce|Vous|Si|Quand|Dans|Tant|Chaque|Sur|Au|Aux|De|Des|Les|Le|La|Un|Une)\b/i.test(name) && name.split(/\s+/).length > 4) return false;
  if (name.split(/\s+/).length > 10) return false;
  if (/^(Action|Actions|Réaction|Description|Source|Objet|Type|Harmonisation|Chapitre|Annexe|Table|d100|dl00|WWW|FOR|DEX|CON|INT|SAG|CHA)$/i.test(name)) return false;
  if (/Classe d['’]armure|Points de vie|Vitesse|Jets de sauvegarde|Compétences|Dangerosité/i.test(name)) return false;
  return true;
}

function isLikelyInlineCaption(name) {
  const key = normalizeName(name);
  if (/^(chapitre|tresors|les-tresors|objet|objets|magiques|table|resistance|effet|type|materiau|dl00|d100)/.test(key)) return true;
  if (/^(oe|de|des|du|la|le|les|au|aux)-/.test(key) && name.split(/\s+/).length > 3) return true;
  return false;
}

function isMagicArmorType(type) {
  return /^(Armure|Bouclier)$/i.test(cleanText(type));
}

function normalizeMagicItemType(type) {
  const cleaned = cleanText(type);
  if (/^Objet merveilleux$/i.test(cleaned)) return 'Objet merveilleux';
  if (/^Baton$/i.test(cleaned)) return 'Bâton';
  return displayTitle(cleaned);
}

function normalizeBaseArmor(baseArmor) {
  const cleaned = cleanText(baseArmor)
    .replace(/\bJourde\b/gi, 'lourde')
    .replace(/\blééère\b/gi, 'légère')
    .replace(/\bau choix\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const key = normalizeName(cleaned);
  const aliases = new Map([
    ['legere-intermediaire-ou-lourde', 'Toute armure'],
    ['legere-intermediaire-ou-jourde', 'Toute armure'],
    ['toute-armure', 'Toute armure'],
    ['armure-de-cuir-cloute', 'Armure de cuir cloutée'],
    ['armure-de-cuir-cloutee', 'Armure de cuir cloutée'],
    ['cuir-cloute', 'Armure de cuir cloutée'],
    ['cuir-cloutee', 'Armure de cuir cloutée'],
    ['armure-decailles', 'Armure d’écailles'],
    ['armure-d-ecailles', 'Armure d’écailles'],
    ['cotte-de-mailles', 'Cotte de mailles'],
    ['chemise-de-mailles', 'Chemise de mailles'],
    ['cuirasse', 'Cuirasse'],
    ['clibanion', 'Clibanion'],
    ['harnois', 'Harnois'],
    ['bouclier', 'Bouclier'],
  ]);
  const alias = aliases.get(key);
  if (alias) return alias;
  const standard = STANDARD_ARMORS.find((armor) => normalizeName(armor.name) === key || key.includes(normalizeName(armor.name)));
  if (standard) return standard.name;
  return displayTitle(cleaned);
}

function inferBaseArmorFromName(name) {
  const key = normalizeName(name);
  for (const armor of STANDARD_ARMORS) {
    const armorKey = normalizeName(armor.name);
    if (key.includes(armorKey)) return armor.name;
  }
  if (/bouclier/.test(key)) return 'Bouclier';
  if (/cuir-cloute/.test(key)) return 'Armure de cuir cloutée';
  if (/cotte-de-mailles/.test(key)) return 'Cotte de mailles';
  if (/chemise-de-mailles/.test(key)) return 'Chemise de mailles';
  if (/ecailles/.test(key)) return 'Armure d’écailles';
  return '';
}

function findBaseArmorData(baseArmor) {
  const key = `armor:${normalizeName(canonicalArmorName(baseArmor))}`;
  const row = entitiesByKey.get(key);
  if (!row || row.categoryId !== CAT.armor) return null;
  return row.data;
}

function inferArmorCategory(baseArmor, name) {
  const base = findBaseArmorData(baseArmor);
  if (base?.armorCategory) return base.armorCategory;
  const key = normalizeName(`${baseArmor} ${name}`);
  if (/bouclier/.test(key)) return 'Bouclier';
  if (/legere|matelassee|cuir-cloutee?/.test(key)) return 'Légère';
  if (/intermediaire|peau|chemise|ecailles|cuirasse|demi-plate/.test(key)) return 'Intermédiaire';
  if (/lourde|broigne|cotte|clibanion|harnois/.test(key)) return 'Lourde';
  return 'Magique';
}

function extractArmorDescriptions(text) {
  const descriptions = new Map();
  const names = STANDARD_ARMORS.map((armor) => armor.name);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const start = normalizedIndexOf(text, `${name}.`);
    if (start < 0) continue;
    const nextIndexes = names.slice(i + 1)
      .map((nextName) => normalizedIndexOf(text, `${nextName}.`, start + name.length))
      .filter((index) => index > start);
    const categoryStop = firstPositiveIndex([
      normalizedIndexOf(text, 'ARMURES INTERMÉDIAIRES', start + name.length),
      normalizedIndexOf(text, 'ARMURES LOURDES', start + name.length),
      normalizedIndexOf(text, 'ARMES', start + name.length),
      ...nextIndexes,
    ], start + 900);
    const description = cleanText(text.slice(start, categoryStop));
    if (description.length > name.length + 8) descriptions.set(normalizeName(name), description);
  }
  return descriptions;
}

function canonicalWeaponName(name) {
  let value = displayTitle(cleanText(name)
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' '));
  const compact = normalizeName(value).replace(/-/g, '');
  if (/^arme\s*\+[123]/i.test(value)) return 'Arme +1/+2/+3';
  if (/^munition\s*\+[123]/i.test(value)) return 'Munition +1/+2/+3';
  if (compact.includes('hazirawn')) return 'Hazirawn';
  if (compact === 'signet') return 'Signet';
  if (compact === 'tearulai') return 'Tearulaï';
  if (compact === 'tranchazur') return 'Tranchazur';

  const aliases = new Map([
    ['baton-de-loublie', 'Bâton de l’Oublié'],
    ['dague-venimeuse', 'Dague de Venin'],
    ['hachette', 'Hache'],
    ['fleau', 'Fléau d’armes'],
    ['fleau-darmes', 'Fléau d’armes'],
    ['fleau-d-armes', 'Fléau d’armes'],
    ['hache-a-deux-mains', 'Grande hache'],
    ['maillet-darmes', 'Maillet'],
    ['maillet-d-armes', 'Maillet'],
    ['lance-d-arcon', 'Lance d’arçon'],
    ['masse-darmes', 'Masse d’armes'],
    ['masse-d-armes', 'Masse d’armes'],
    ['yklwa', 'Yklwa'],
  ]);
  return aliases.get(normalizeName(value)) ?? value;
}

function normalizeBaseWeapon(baseWeapon) {
  const cleaned = cleanText(baseWeapon)
    .replace(/^n'importe quelle\s+/i, 'Toute ')
    .replace(/\s+/g, ' ');
  if (/^toutes?$/i.test(cleaned)) return 'Toute arme';
  const canonical = canonicalWeaponName(cleaned);
  const baseRow = entitiesByKey.get(`weapon:${normalizeName(canonical)}`);
  if (baseRow?.categoryId === CAT.weapon) return baseRow.name;
  if (/^toute\s/i.test(canonical)) return canonical;
  return /^[a-zà-öø-ÿ]/.test(canonical) ? titleCase(canonical) : canonical;
}

function normalizeWeaponLine(line) {
  return cleanText(line)
    .replace(/[{}]/g, ')')
    .replace(/\bl\s+(?=po|pa|pc|kg\b)/gi, '1 ')
    .replace(/\b0,5\s*kg\b/gi, '500 g')
    .replace(/\b0,1\s*kg\b/gi, '100 g')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDiceText(line) {
  return line.replace(/\b[1l]\s*d\s*[1l]?\s*[0-9oO]+\b/g, (value) => normalizeDamageDice(value));
}

function normalizeDamageDice(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^l/, '1')
    .replace(/d[l]/, 'd1')
    .replace(/o/g, '0');
}

function normalizeWeaponNumber(value) {
  const text = cleanText(value);
  return text === '-' ? '' : text;
}

function parseWeaponProperties(text) {
  if (!text || text === '-') return [];
  return text
    .split(/,\s+(?=[A-Za-zÀ-ÖØ-öø-ÿ])/)
    .map(cleanWeaponProperty)
    .filter(Boolean);
}

function cleanWeaponProperty(value) {
  return cleanText(value)
    .replace(/\bspéciale\b/gi, 'spécial')
    .replace(/\bld/g, '1d')
    .replace(/\bportée\s+([\d,.]+)\s*m?\s*\/\s*([\d,.]+)\s*m?/gi, (_, short, long) => `portée ${normalizeRangePart(short)} m/${normalizeRangePart(long)} m`)
    .replace(/\s+\/\s*/g, '/')
    .toLowerCase();
}

function extractWeaponRange(properties) {
  for (const property of properties ?? []) {
    const match = property.match(/portée\s+([^)]+)/i);
    if (match) return normalizeWeaponRange(match[1]);
  }
  return '';
}

function normalizeWeaponRange(value) {
  return cleanText(value)
    .replace(/([\d,.]+)\s*m?\s*\/\s*([\d,.]+)\s*m?/i, (_, short, long) => `${normalizeRangePart(short)} m/${normalizeRangePart(long)} m`)
    .replace(/\s+\/\s*/g, '/')
    .replace(/(\d),(\d)/g, '$1,$2')
    .replace(/^portée\s+/i, '');
}

function normalizeRangePart(value) {
  const text = cleanText(value);
  const decimal = text.match(/^(\d+),(\d)$/);
  return decimal ? `${decimal[1]},${decimal[2]}0` : text;
}

function parseWeaponRarity(text) {
  const value = normalizeMagicText(text);
  const match = value.match(/(peu commun(?:e)?|peu courant(?:e)?|très rare|légendaire|artefact|courant(?:e)?|rare)/i);
  return match ? normalizeRarity(match[1]) : '';
}

function normalizeMagicText(text) {
  return cleanText(text)
    .replace(/lége\s*ndaire/gi, 'légendaire')
    .replace(/h\s*armonisation/gi, 'harmonisation')
    .replace(/harmonis\s*ation/gi, 'harmonisation')
    .replace(/nécessite\s+une?\s+harmonisation/gi, 'nécessite une harmonisation');
}

function normalizeRarity(value) {
  const rarity = cleanText(value).toLowerCase();
  if (!rarity) return '';
  if (rarity.includes('variable')) return 'Variable';
  if (rarity.includes('peu commun') || rarity.includes('peu courant')) return 'Peu commun';
  if (rarity.includes('très rare')) return 'Très rare';
  if (rarity.includes('légendaire')) return 'Légendaire';
  if (rarity.includes('artefact')) return 'Artefact';
  if (rarity.includes('rare')) return 'Rare';
  if (rarity.includes('courant')) return 'Courante';
  return displayTitle(rarity);
}

function parseWeaponBonus(text) {
  const bonuses = [...String(text ?? '').matchAll(/\+([123])/g)].map((m) => `+${m[1]}`);
  return normalizeWeaponBonus(uniqueList(bonuses).join('/'));
}

function normalizeWeaponBonus(value) {
  return uniqueList(String(value ?? '').split(/[\/,\s]+/).filter((x) => /^\+[123]$/.test(x))).join('/');
}

function firstPositiveIndex(indexes, fallback) {
  const found = indexes.filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return found ?? fallback;
}

function normalizedIndexOf(text, needle, fromIndex = 0) {
  if (!needle) return -1;
  const normalize = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalize(text).indexOf(normalize(needle), fromIndex);
}

function excerptBetween(text, start, stopNeedles = [], maxLength = 1600) {
  if (start < 0) return '';
  const raw = text.slice(start, start + maxLength);
  let end = raw.length;
  for (const needle of stopNeedles) {
    const idx = normalizedIndexOf(raw, needle);
    if (idx > 0) end = Math.min(end, idx);
  }
  return cleanText(raw.slice(0, end));
}

function parseMonsterManual(fullText, sourceFile, sourceName, license, quality) {
  const profileIndex = extractMonsterManualProfileIndex(fullText);
  parseStatBlocks(fullText, sourceFile, sourceName, license, quality, {
    categoryKey: 'monster',
    baseTag: 'monstre',
    profileIndex,
    requireProfileIndex: true,
  });
}

function extractMonsterManualProfileIndex(fullText) {
  const pages = splitPages(fullText);
  const indexText = pages.slice(350, 354).join('\n');
  const byPage = new Map();
  const allNames = new Set();
  let pending = '';

  for (const rawLine of normalizePdfText(indexText).split('\n')) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/^(INDEX|INPEX|lNùEX|LE BESTIAIRE|Utilisez cet index|\d+\s+IN)/i.test(line)) continue;
    if (/^[A-ZÀ-ÖØ-Þa-zà-öø-ÿ]$/.test(line)) continue;
    if (/^[,.'·•\-\s]+$/.test(line)) continue;

    const match = line.match(/^(.+?)[,.]\s*(\d{1,3})$/);
    if (!match) {
      if (!/\d/.test(line) && line.length < 80) pending = pending ? `${pending} ${line}` : line;
      continue;
    }

    const name = cleanManualProfileName(`${pending} ${match[1]}`.trim());
    pending = '';
    const page = Number(match[2]);
    if (!name || !page || page < 10 || page > 354) continue;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(name);
    allNames.add(normalizeName(name));
  }

  return { byPage, allNames };
}

function cleanManualProfileName(name) {
  return displayTitle(name)
    .replace(/^([A-ZÀ-ÖØ-Þ])([A-ZÀ-ÖØ-Þ])(?=[a-zà-öø-ÿ])/, (match, a, b) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr') ? b : match)
    .replace(/^([A-ZÀ-ÖØ-Þ])([a-zà-öø-ÿ])(?=[a-zà-öø-ÿ])/, (match, a, b) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr') ? b : match)
    .replace(/^[a-zà-öø-ÿ](?=[A-ZÀ-ÖØ-Þ])/, '')
    .replace(/\bAzcr\b/gi, 'Azer')
    .replace(/\bBabélicn\b/gi, 'Babélien')
    .replace(/\bBadgura\b/gi, 'Barlgura')
    .replace(/\bBête Éclipsantc\b/gi, 'Bête Éclipsante')
    .replace(/Couat!/gi, 'Couatl')
    .replace(/\bFlumμh\b/gi, 'Flumph')
    .replace(/\bMemal\b/gi, 'Mental')
    .replace(/Dragonne!/gi, 'Dragonnet')
    .replace(/\bVen\b/gi, 'Vert')
    .replace(/\bVénérabl\b/gi, 'Vénérable')
    .replace(/\bAduhe\b/gi, 'Adulte')
    .replace(/\bBrom;e\b/gi, 'Bronze')
    .replace(/\bOre\b/gi, 'Orc')
    .replace(/\bServiieur\b/gi, 'Serviteur')
    .replace(/\bS!aad\b/gi, 'Slaad')
    .replace(/\bTemp€tes\b/gi, 'Tempêtes')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStatBlocks(fullText, sourceFile, sourceName, license, quality, options = {}) {
  const categoryKey = options.categoryKey ?? 'monster';
  const baseTag = options.baseTag ?? 'monstre';
  const profileUsed = new Set();
  const text = normalizePdfText(fullText);
  const startRe = /(?:^|\n)([A-ZÀ-ÖØ-Þa-zà-öø-ÿ0-9][^\n]{1,90})\n((?:Aberration|Bête|Céleste|Créature artificielle|Créature monstrueuse|Dragon|Élémentaire|Fée|Fiélon|Géant|Humanoïde|Mort-vivant|Plante|Vase|Nuée)[^\n]*?)\nClasse d[’']armure/gi;
  const starts = [];
  let m;
  while ((m = startRe.exec(text))) {
    const name = cleanTitle(m[1]);
    if (!isLikelyCreatureName(name)) continue;
    starts.push({ index: m.index + (m[0].startsWith('\n') ? 1 : 0), name, typeLine: cleanText(m[2]) });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = starts[i + 1]?.index ?? text.length;
    const segment = text.slice(start.index, end).trim();
    const parsed = parseCreatureSegment(start.name, start.typeLine, segment);
    if (!parsed) continue;
    const sourcePage = pageForIndex(fullText, start.index);
    if (options.profileIndex) {
      const resolved = resolveProfileName(start.name, sourcePage, options.profileIndex, profileUsed);
      if (!resolved) {
        if (options.requireProfileIndex) continue;
      } else {
        parsed.name = resolved;
        profileUsed.add(normalizeName(resolved));
      }
    }
    const nameKey = normalizeName(parsed.name);
    if (categoryKey !== 'animal' && animalNameKeys.has(nameKey)) continue;
    parsed.data.sourceFile = sourceFile;
    parsed.data.sourcePage = sourcePage;
    const tags = [baseTag, parsed.data.type, parsed.data.size, parsed.data.cr ? `fp ${parsed.data.cr}` : '', sourceName];
    if (categoryKey === 'animal') animalNameKeys.add(nameKey);
    addEntity(categoryKey, parsed.name, parsed.data, parsed.summary, tags, sourceName, license, quality);
  }
}

function pruneMonsterDuplicatesFromAnimals() {
  const animalKeys = new Set(
    [...entitiesByKey.values()]
      .filter((entity) => entity.categoryId === CAT.animal)
      .map((entity) => normalizeName(entity.name)),
  );
  if (!animalKeys.size) return;

  for (const [key, entity] of entitiesByKey.entries()) {
    if (entity.categoryId !== CAT.monster) continue;
    if (!animalKeys.has(normalizeName(entity.name))) continue;
    entitiesByKey.delete(key);
    qualityByKey.delete(key);
  }
}

function resolveProfileName(rawName, page, profileIndex, usedNames) {
  const candidates = profileIndex.byPage.get(page) ?? [];
  if (!candidates.length) return null;

  const unused = candidates.filter((name) => !usedNames.has(normalizeName(name)));
  const pool = unused.length ? unused : candidates;
  if (pool.length === 1) return pool[0];

  const ranked = pool
    .map((name) => ({ name, score: stringSimilarity(rawName, name) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.22 ? ranked[0].name : null;
}

function stringSimilarity(a, b) {
  const aa = normalizeName(a).replace(/-/g, '');
  const bb = normalizeName(b).replace(/-/g, '');
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const aBigrams = bigrams(aa);
  const bBigrams = bigrams(bb);
  if (!aBigrams.size || !bBigrams.size) return 0;
  let hits = 0;
  for (const gram of aBigrams) if (bBigrams.has(gram)) hits++;
  return (2 * hits) / (aBigrams.size + bBigrams.size);
}

function bigrams(text) {
  const grams = new Set();
  for (let i = 0; i < text.length - 1; i++) grams.add(text.slice(i, i + 2));
  return grams;
}

function parseCreatureSegment(name, typeLine, segment) {
  const ac = matchLine(segment, /Classe d[’']armure\s+([^\n]+)/i);
  const hpLine = matchLine(segment, /Points de vie\s+([^\n]+)/i);
  const speed = matchLine(segment, /Vitesse\s+([^\n]+)/i);
  const crLine = matchLine(segment, /(?:Facteur de puissance|Dangerosité)\s+([^\n]+)/i);
  if (!ac || !hpLine || !crLine) return null;

  const hpMatch = hpLine.match(/^(\d+)\s*(?:\(([^)]+)\))?/);
  const cr = parseChallengeRating(crLine);
  const abilities = parseAbilities(segment);
  const actionText = sectionText(segment, ['ACTIONS', 'Actions'], ['RÉACTIONS', 'Réactions', 'ACTIONS LÉGENDAIRES', 'Actions légendaires', 'Actions de repaire', 'Le repaire']);
  const reactionText = sectionText(segment, ['RÉACTIONS', 'Réactions'], ['ACTIONS LÉGENDAIRES', 'Actions légendaires', 'Actions de repaire', 'Le repaire']);
  const legendaryText = sectionText(segment, ['ACTIONS LÉGENDAIRES', 'Actions légendaires'], ['Le repaire', 'Actions de repaire', 'Effets régionaux']);
  const traits = traitsText(segment);
  const parsedType = parseTypeLine(typeLine);

  return {
    name,
    summary: `${parsedType.size ? parsedType.size + ' · ' : ''}${parsedType.type || 'Créature'} · FP ${cr}`,
    data: {
      type: parsedType.type,
      size: parsedType.size,
      alignment: parsedType.alignment,
      ac: numberFrom(ac),
      hp: hpMatch ? Number(hpMatch[1]) : null,
      hitDice: hpMatch?.[2] ?? '',
      speed,
      abilities,
      saves: matchLine(segment, /Jets de sauvegarde\s+([^\n]+)/i),
      skills: matchLine(segment, /Compétences\s+([^\n]+)/i),
      resistances: splitTags(matchLine(segment, /Résistances aux dégâts\s+([^\n]+)/i)),
      immunities: splitTags(matchLine(segment, /Immunités(?: aux dégâts| à l’état| aux états)?\s+([^\n]+)/i)),
      senses: matchLine(segment, /Sens\s+([^\n]+)/i),
      languages: matchLine(segment, /Langues\s+([^\n]+)/i),
      cr,
      description: traits,
      actions: splitActions(actionText),
      reactions: splitActions(reactionText),
      legendary: splitActions(legendaryText),
    },
  };
}

function parseTypeLine(typeLine) {
  const line = cleanText(typeLine)
    .replace(/\s+\[[^\]]+\]/g, '')
    .replace(/tai\{?\/?e|tailie|toi\/le/gi, 'taille')
    .replace(/Pet\{te/gi, 'Petite')
    .replace(/Gronde/gi, 'Grande')
    .replace(/\bPaille\b/gi, 'taille');
  const sizePattern = '(TP|P|M|G|TG|Gig|Très Petite|Petite|Moyenne|Grande|Très Grande|Gigantesque)';
  const beforeSize = line.match(new RegExp(`\\bde\\s+${sizePattern}\\s+taille\\b`, 'i'));
  const afterSize = line.match(new RegExp(`\\btaille\\s+${sizePattern}\\b`, 'i'));
  const sizeBeforeDe = line.match(new RegExp(`\\b${sizePattern}\\s+de\\s+taille\\b`, 'i'));
  const size = beforeSize?.[1] ?? afterSize?.[1] ?? sizeBeforeDe?.[1] ?? '';
  const type = beforeSize || sizeBeforeDe
    ? line.slice(0, (beforeSize ?? sizeBeforeDe).index).trim()
    : line.split(/\s+de taille\s+/i)[0]?.trim() ?? '';
  const alignment = typeLine.includes(',') ? typeLine.split(',').slice(1).join(',').replace(/\[[^\]]+\]/g, '').trim() : '';
  return { type: cleanCreatureType(type), size, alignment: cleanText(alignment) };
}

function cleanCreatureType(type) {
  return cleanText(type)
    .replace(/\bgno\/1\b/gi, 'gnoll')
    .replace(/\bore\b/gi, 'orc')
    .replace(/\s*[.\-]\s*$/, '')
    .trim();
}

function parseAbilities(segment) {
  const row = segment.match(/FOR\s+DEX\s+CON\s+INT\s+SAG\s+CHA\s*\n([^\n]+)\n/i);
  if (row) {
    const vals = row[1].match(/\d+\s*\([+-]?\d+\)/g) ?? [];
    if (vals.length >= 6) return { FOR: vals[0], DEX: vals[1], CON: vals[2], INT: vals[3], SAG: vals[4], CHA: vals[5] };
  }
  const lines = normalizePdfText(segment).split('\n').map((line) => cleanText(line)).filter(Boolean);
  const abilities = {};
  const labels = [
    ['FOR', /^FOR$/i],
    ['DEX', /^DEX$/i],
    ['CON', /^CON$/i],
    ['INT', /^INT$/i],
    ['SAG', /^(SAG|SAC)$/i],
    ['CHA', /^CHA$/i],
  ];

  for (let i = 0; i < lines.length; i++) {
    const found = labels.find(([, re]) => re.test(lines[i]));
    if (!found) continue;
    const value = lines.slice(i + 1, i + 5).find((line) => /[0-9Il]{1,3}\s*\([+-]?\d+\)/.test(line));
    if (value) abilities[found[0]] = normalizeAbilityValue(value);
  }

  return abilities;
}

function normalizeAbilityValue(value) {
  const match = String(value ?? '').match(/([0-9Il]{1,3})\s*\(([+-]?\d+)\)/);
  if (!match) return cleanText(value);
  const mod = Number(match[2]);
  let score = Number(match[1].replace(/[Il]/g, '1'));
  if (score > 30 && Number.isFinite(mod)) score = 10 + 2 * mod;
  return `${score} (${match[2]})`;
}

function parseChallengeRating(crLine) {
  const cleaned = cleanText(crLine)
    .replace(/\([^)]*\)/g, '')
    .replace(/[lI]\s*\//g, '1/')
    .replace(/\bl\s*(\d)\b/gi, '1$1')
    .replace(/\bI\s*(\d)\b/g, '1$1')
    .replace(/\bl\b/gi, '1')
    .replace(/\bI\b/g, '1')
    .replace(/\bO\b/g, '0')
    .replace(/\bS\b/g, '5')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.match(/(\d+\s*\/\s*\d+|\d+)/)?.[1]?.replace(/\s+/g, '') ?? cleaned;
}

function traitsText(segment) {
  const fp = segment.search(/(?:Facteur de puissance|Dangerosité)\s+[^\n]+\n/i);
  if (fp < 0) return '';
  const afterFp = segment.slice(fp).replace(/^(?:Facteur de puissance|Dangerosité)\s+[^\n]+\n/i, '');
  const actionAt = findHeading(afterFp, ['ACTIONS', 'Actions']);
  return cleanText((actionAt >= 0 ? afterFp.slice(0, actionAt) : afterFp).trim());
}

function splitActions(text) {
  if (!text) return [];
  const chunks = text
    .split(/\n(?=[A-ZÀ-ÖØ-Þ][^.\n]{1,80}\.\s)/g)
    .map((x) => cleanText(x))
    .filter((x) => x.length > 2);
  return chunks.length ? chunks : [cleanText(text)];
}

function parseSpells(fullText, sourceFile, sourceName, quality) {
  const text = normalizePdfText(fullText);
  const start = text.search(/DESCRIPTION DES SORTS/i);
  if (start < 0) return;
  const body = text.slice(start);
  const re = /(?:^|\n)([A-ZÀ-ÖØ-ÞŒÆ0-9][A-ZÀ-ÖØ-ÞŒÆ0-9'’\- /]+)\n(niveau\s+[0-9]+|niveau\s+0|sort mineur|tour de magie)\s*-\s*([^\n]+)/gi;
  const starts = [];
  let m;
  while ((m = re.exec(body))) starts.push({ index: start + m.index + (m[0].startsWith('\n') ? 1 : 0), name: cleanTitle(m[1]), levelLine: m[2], school: cleanText(m[3]) });
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const end = starts[i + 1]?.index ?? text.length;
    const segment = text.slice(s.index, end).trim();
    const body = spellBody(segment);
    const data = {
      level: numberFrom(s.levelLine) ?? 0,
      school: s.school,
      casting: spellField(segment, 'Temps d[’\\\']incantation', ['Portée']),
      range: spellField(segment, 'Portée', ['Composantes']),
      components: spellField(segment, 'Composantes', ['Durée']),
      duration: spellField(segment, 'Durée', []),
      description: cleanText(body.split(/Aux niveaux supérieurs\./i)[0]),
      higher: cleanText(body.match(/Aux niveaux supérieurs\.\s*([\s\S]*)/i)?.[1] ?? ''),
      sourceFile,
      sourcePage: pageForIndex(fullText, s.index),
    };
    addEntity('spell', s.name, data, `${data.level === 0 ? 'Sort mineur' : `Niveau ${data.level}`} · ${data.school}`, ['sort', data.school, `niveau ${data.level}`], sourceName, sourceLicense(sourceFile), quality);
  }
}

function parsePlayerOptions(fullText, sourceFile, sourceName) {
  const pages = splitPages(fullText);
  const toc = extractToc(fullText).filter((x) => !['SOMMAIRE', 'RACES', 'CLASSES', 'SORTS'].includes(x.title.toUpperCase()));
  const names = toc.filter((x) => x.page < 36 && !/OPEN GAME LICENSE/i.test(x.title));
  const offset = findAideDdOffset(pages);
  for (let i = 0; i < names.length; i++) {
    const cur = names[i];
    const next = names[i + 1];
    const pageStart = offset + cur.page;
    const pageEnd = next ? Math.max(pageStart, offset + next.page - 1) : pageStart + 2;
    const content = cleanText(pages.slice(pageStart - 1, pageEnd).join('\n'));
    const type = cur.page <= 5 ? 'Race' : /voie|collège|cercle|serment|archétype|fiélon|ancien|fée/i.test(cur.title) ? 'Sous-classe' : 'Classe';
    addEntity('playerOption', cur.title, {
      type,
      sourceFile,
      pageStart,
      pageEnd,
      traits: extractTraits(content),
      description: content,
    }, `${type} · ${sourceName}`, ['personnage', type.toLowerCase()], sourceName, LICENSE_AIDEDD, 80);
  }
}

function spellField(segment, label, nextLabels) {
  if (nextLabels.length) {
    const next = nextLabels.join('|');
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:${next})\\s*:)`, 'i');
    return cleanText(segment.match(re)?.[1] ?? '');
  }
  return matchLine(segment, new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'));
}

function spellBody(segment) {
  const duration = segment.match(/Durée\s*:\s*[^\n]+\n/i);
  if (duration?.index == null) return cleanText(segment.replace(/^.+?\n.+?\n/i, ''));
  return cleanText(segment.slice(duration.index + duration[0].length));
}

function parseRuleSections(fullText, sourceFile, sourceName, type) {
  const pages = splitPages(fullText);
  const toc = extractToc(fullText).filter((x) => isMostlyUpper(x.title) && x.page > 0);
  const offset = findAideDdOffset(pages);
  for (let i = 0; i < toc.length; i++) {
    const cur = toc[i];
    const next = toc[i + 1];
    const pageStart = offset + cur.page;
    const pageEnd = next ? Math.max(pageStart, offset + next.page - 1) : Math.min(pages.length, pageStart + 4);
    const content = cleanText(pages.slice(pageStart - 1, pageEnd).join('\n'));
    if (!content || content.length < 120) continue;
    addEntity('rule', cur.title, {
      type,
      sourceFile,
      pageStart,
      pageEnd,
      description: content,
    }, `${type} · p. ${cur.page}`, ['règle', type.toLowerCase()], sourceName, LICENSE_AIDEDD, 70);
  }
}

function extractTraits(content) {
  return (content.match(/^[A-ZÀ-ÖØ-Þ][^.:\n]{2,60}\./gm) ?? [])
    .slice(0, 12)
    .map((x) => cleanText(x.replace(/\.$/, '')));
}

function extractToc(text, outline = undefined) {
  if (Array.isArray(outline) && outline.length) {
    return flattenOutline(outline).map((title, i) => ({ title, page: i + 1 })).slice(0, 120);
  }
  const lines = normalizePdfText(text).split('\n').map((l) => cleanText(l)).filter(Boolean);
  const out = [];
  let inToc = false;
  for (const line of lines) {
    if (/^(SOMMAIRE|TABLE DES MATIÈRES|TABLE DES MATIERES)/i.test(line)) {
      inToc = true;
      continue;
    }
    if (!inToc) continue;
    if (/^(WWW\.|--\s*\d+\s+of\s+\d+\s*--)/i.test(line) && out.length > 5) break;
    if (/^(OPEN GAME LICENSE|TESTEURS|CREDITS|CRÉDITS|AVERTISSEMENT)/i.test(line) && out.length > 5) break;
    const cleaned = line.replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
    const m = cleaned.match(/^(.{2,95}?)\s+(\d{1,3})$/);
    if (m && !/^\d+$/.test(m[1])) out.push({ title: cleanTitle(m[1]), page: Number(m[2]) });
    if (out.length > 180) break;
  }
  return out;
}

function flattenOutline(items) {
  const out = [];
  for (const item of items) {
    if (item.title) out.push(cleanTitle(item.title));
    if (item.items) out.push(...flattenOutline(item.items));
  }
  return out;
}

async function readPdfInfo(file) {
  const data = await readFile(file);
  const parser = new PDFParse({ data });
  try {
    const info = await parser.getInfo({ parsePageInfo: false });
    return { total: info.total, outline: info.outline ?? [] };
  } finally {
    await parser.destroy();
  }
}

async function readPdfText(file, options = {}) {
  const data = await readFile(file);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText(options);
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}

async function readPdfOcrText(file) {
  const ocrPath = pdfOcrPath(file);
  if (!existsSync(ocrPath)) return '';
  return readFile(ocrPath, 'utf8').catch(() => '');
}

function pdfOcrPath(file) {
  return path.join(OCR_DIR, `${path.basename(file, '.pdf')}.ocr.txt`);
}

function selectBestPdfText(nativeText, ocrText) {
  const nativeLength = meaningfulPdfTextLength(nativeText);
  const ocrLength = meaningfulPdfTextLength(ocrText);
  if (ocrLength > Math.max(500, nativeLength * 1.8)) return ocrText;
  return nativeText ?? '';
}

function meaningfulPdfTextLength(text) {
  return String(text ?? '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '')
    .replace(/\s+/g, '')
    .length;
}

async function renderCover(file, title) {
  const rel = `/images/info-dnd/covers/${slugify(title)}.png`;
  const abs = path.join(ROOT, 'public', rel);
  if (!FORCE_IMAGES && existsSync(abs)) return rel;
  const data = await readFile(file);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getScreenshot({ partial: [1], desiredWidth: 760, imageDataUrl: false, imageBuffer: true });
    const page = result.pages?.[0];
    if (!page?.data) return '';
    await writeFile(abs, page.data);
    return rel;
  } catch {
    return '';
  } finally {
    await parser.destroy();
  }
}

function splitPages(text) {
  const pages = [];
  const re = /--\s*(\d+)\s+of\s+\d+\s*--/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last && pages.length) pages[pages.length - 1] += text.slice(last, m.index);
    pages[Number(m[1]) - 1] = '';
    last = re.lastIndex;
  }
  if (pages.length) pages[pages.length - 1] += text.slice(last);
  return pages.map((p) => normalizePdfText(p ?? ''));
}

function findAideDdOffset(pages) {
  for (let i = 0; i < pages.length; i++) {
    if (/WWW\.AIDEDD\.ORG/i.test(pages[i]) && /\n1\n/.test(pages[i])) return i + 1 - 1;
  }
  return 0;
}

function pageForIndex(text, index) {
  const before = text.slice(0, Math.max(0, index));
  const matches = [...before.matchAll(/--\s*(\d+)\s+of\s+\d+\s*--/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

function normalizePdfText(text) {
  return (text ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function cleanText(text) {
  return String(text ?? '')
    .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, '')
    .replace(/^WWW\.AIDEDD\.ORG\s*\|[^\n]*\n\d+\s*$/gim, '')
    .replace(/^\d+\s*\nCompendium monStrueux\s*$/gim, '')
    .replace(/^Compendium monStrueux\s*\n\d+\s*$/gim, '')
    .replace(/^liSte\s+deS\s+\w+\s*$/gim, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanTitle(text) {
  return cleanText(text)
    .replace(/^[-–—•\s]+/, '')
    .replace(/\s+\.?$/, '')
    .replace(/\s+/g, ' ');
}

function displayTitle(text) {
  let s = cleanTitle(text)
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .replace(/\b([A-ZÀ-ÖØ-Þ])\s+([a-zà-öø-ÿ]{2,})\b/g, '$1$2');

  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  const allUpper = letters.length > 2 && letters === letters.toLocaleUpperCase('fr');
  const oddCaps = /[a-zà-öø-ÿ][A-ZÀ-ÖØ-Þ]/.test(s) || /\b[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]?\s+[a-zà-öø-ÿ]{2,}\b/.test(s);
  if (allUpper || oddCaps) s = titleCase(s);
  return s;
}

function titleCase(text) {
  const small = new Set(['à', 'au', 'aux', 'de', 'des', 'du', 'et', 'la', 'le', 'les', 'un', 'une', 'd', 'l']);
  return text
    .toLocaleLowerCase('fr')
    .split(/(\s+|-|,|:|\/)/)
    .map((part, index, parts) => {
      if (!/[a-zà-öø-ÿ]/i.test(part)) return part;
      const bare = part.replace(/[’']/g, '');
      const previous = parts.slice(0, index).reverse().find((p) => p.trim());
      if (index > 0 && previous !== ':' && !part.includes('’') && !part.includes("'") && small.has(bare)) return part;
      return part.replace(/(^|[’'])([a-zà-öø-ÿ])/g, (m, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('fr')}`);
    })
    .join('')
    .replace(/\bPnj\b/g, 'PNJ')
    .replace(/\bMj\b/g, 'MJ')
    .replace(/\bD&d\b/gi, 'D&D');
}

function titleFromFile(file) {
  return file
    .replace(/\.pdf$/i, '')
    .replace(/^D&D\s*5\s*-\s*/i, '')
    .replace(/^D&D5\s*-\s*/i, '')
    .normalize('NFC')
    .replace(/Cô/g, 'Cô')
    .replace(/Trésor/g, 'Trésor')
    .replace(/Malédiction/g, 'Malédiction')
    .replace(/Dément/g, 'Dément')
    .replace(/Tempêtes/g, 'Tempêtes')
    .replace(/maître/g, 'maître');
}

function normalizeName(name) {
  return cleanText(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function slugify(name) {
  return normalizeName(name) || 'source';
}

function isLikelyCreatureName(name) {
  if (name.length < 2 || name.length > 80) return false;
  if (/^(Actions|Réactions|Sens|Langues|Classe|Points|Vitesse|Compétences|Facteur|Dégâts|Sorts|Niveau|WWW|Compendium|Sage Advice)$/i.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  return true;
}

function isMostlyUpper(text) {
  const letters = text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (letters.length < 3) return false;
  const uppers = letters.replace(/[a-zà-öø-ÿ]/g, '').length;
  return uppers / letters.length > 0.7;
}

function matchLine(text, re) {
  return cleanText(text.match(re)?.[1] ?? '');
}

function numberFrom(text) {
  const n = String(text ?? '').replace(/\s/g, '').match(/\d+/)?.[0];
  return n == null ? null : Number(n);
}

function splitTags(text) {
  if (!text) return [];
  return text.split(/[,;]+/).map((x) => cleanText(x).toLowerCase()).filter(Boolean);
}

function findHeading(text, headings) {
  const wanted = headings.map((h) => h.toLowerCase());
  const lines = text.split('\n');
  let pos = 0;
  for (const line of lines) {
    if (wanted.includes(cleanText(line).toLowerCase())) return pos;
    pos += line.length + 1;
  }
  return -1;
}

function sectionText(text, headings, stopHeadings) {
  const start = findHeading(text, headings);
  if (start < 0) return '';
  const after = text.slice(start).split('\n').slice(1).join('\n');
  const stop = findHeading(after, stopHeadings);
  return cleanText(stop >= 0 ? after.slice(0, stop) : after);
}

function buildSql(payload) {
  const categoryRows = payload.categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    icon: c.icon,
    schema: c.schema,
    display_template: c.displayTemplate,
    default_tags: c.defaultTags,
    is_system: c.isSystem,
    owner_id: c.ownerId,
  }));
  const entityRows = payload.entities.map((e) => ({
    id: e.id,
    category_id: e.categoryId,
    owner_id: e.ownerId,
    kind: e.kind,
    visibility: e.visibility,
    parent_id: e.parentId,
    name: e.name,
    summary: e.summary,
    data: e.data,
    patch: e.patch,
    tags: e.tags,
    license: e.license,
    source_name: e.sourceName,
    rev: e.rev,
    is_default_variant: e.isDefaultVariant,
    deleted_at: e.deletedAt,
  }));

  return [
    '-- Generated by scripts/build-info-dnd.mjs',
    `-- Version: ${payload.version}`,
    'begin;',
    '',
    "-- Remove previous official/source content generated for the app.",
    "delete from entity_versions where entity_id in (select id from entities where owner_id is null);",
    "delete from campaign_entities where entity_id in (select id from entities where owner_id is null);",
    "delete from favorites where entity_id in (select id from entities where owner_id is null);",
    "delete from entities where owner_id is null;",
    "delete from categories where owner_id is null;",
    '',
    'insert into categories (id, slug, name, description, icon, schema, display_template, default_tags, is_system, owner_id)',
    `select id::uuid, slug, name, description, icon, schema::jsonb, display_template::jsonb, default_tags::text[], is_system, owner_id::uuid from jsonb_to_recordset(${sqlString(JSON.stringify(categoryRows))}::jsonb) as x(id text, slug text, name text, description text, icon text, schema jsonb, display_template jsonb, default_tags text[], is_system boolean, owner_id text);`,
    '',
    ...chunk(entityRows, 250).flatMap((rows, i) => [
      `-- entities chunk ${i + 1}`,
      'insert into entities (id, category_id, owner_id, kind, visibility, parent_id, name, summary, data, patch, tags, license, source_name, rev, is_default_variant, deleted_at)',
      `select id::uuid, category_id::uuid, owner_id::uuid, kind::entity_kind, visibility::visibility, parent_id::uuid, name, summary, data::jsonb, patch::jsonb, tags::text[], license, source_name, rev, is_default_variant, deleted_at::timestamptz from jsonb_to_recordset(${sqlString(JSON.stringify(rows))}::jsonb) as x(id text, category_id text, owner_id text, kind text, visibility text, parent_id text, name text, summary text, data jsonb, patch jsonb, tags text[], license text, source_name text, rev int, is_default_variant boolean, deleted_at text);`,
      '',
    ]),
    'commit;',
    '',
  ].join('\n');
}

function sqlString(value) {
  return `$json$${value.replace(/\$json\$/g, '$ json $')}$json$`;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
