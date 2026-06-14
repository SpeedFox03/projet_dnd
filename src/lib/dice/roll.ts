/**
 * Moteur de lancer de dés. Interprète une notation type D&D :
 *   "3d8", "1d4 + 2", "2d6+3", "d20", "+5", "-1"
 *
 * - Une expression sans "d" (ex. "+5") est traitée comme un test : 1d20 + N.
 * - Plusieurs termes additionnés/soustraits sont supportés.
 */

export interface DieGroup {
  count: number;
  sides: number;
  rolls: number[];
}

export interface RollResult {
  /** Expression normalisée affichée à l'utilisateur (ex. "1d20 + 1"). */
  expression: string;
  groups: DieGroup[];
  modifier: number;
  total: number;
}

/** Vrai si la chaîne contient une expression lançable (dé ou modificateur). */
export function isRollable(raw: string): boolean {
  return /\d*d\d+/i.test(raw) || /[+-]\s*\d+/.test(raw);
}

/**
 * Lance l'expression. `raw` peut être "3d8", "1d6 + 2", "+5"…
 * Retourne null si rien d'interprétable.
 */
export function rollExpression(raw: string): RollResult | null {
  const norm = raw.replace(/\s+/g, '');
  // Sans dé -> test de caractéristique/sauvegarde : 1d20 + modificateur.
  const expr = /d/i.test(norm) ? norm : `1d20${/^[+-]/.test(norm) ? '' : '+'}${norm}`;

  const termRe = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/gi;
  const groups: DieGroup[] = [];
  let modifier = 0;
  let found = false;
  let m: RegExpExecArray | null;

  while ((m = termRe.exec(expr)) !== null) {
    if (m[3]) {
      // Terme de dés : [count]d[sides]
      found = true;
      const count = m[2] === '' ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) continue;
      const rolls: number[] = [];
      for (let i = 0; i < count; i += 1) rolls.push(1 + Math.floor(Math.random() * sides));
      groups.push({ count, sides, rolls });
    } else if (m[4]) {
      modifier += parseInt(m[4], 10);
      found = true;
    }
  }

  if (!found) return null;

  const diceTotal = groups.reduce((a, g) => a + g.rolls.reduce((x, y) => x + y, 0), 0);
  return {
    expression: formatExpression(groups, modifier),
    groups,
    modifier,
    total: diceTotal + modifier,
  };
}

function formatExpression(groups: DieGroup[], modifier: number): string {
  const parts = groups.map((g) => `${g.count}d${g.sides}`);
  let s = parts.join(' + ') || '0';
  if (modifier > 0) s += ` + ${modifier}`;
  else if (modifier < 0) s += ` − ${Math.abs(modifier)}`;
  return s;
}
