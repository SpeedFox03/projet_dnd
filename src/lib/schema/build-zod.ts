/**
 * Génère un schéma de validation Zod À PARTIR du schéma d'une catégorie.
 * C'est ce qui garantit que `data` reste cohérent quelle que soit la catégorie,
 * sans coder de validation en dur. Utilisé par l'EntityEditor (RHF + zodResolver).
 */

import { z } from 'zod';
import type { CategorySchema, FieldDef } from '@/types/domain';

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  switch (f.type) {
    case 'number': {
      // Les inputs renvoient une chaîne : on coerce, et '' -> undefined si optionnel.
      const base = z.preprocess(
        (v) => (v === '' || v == null ? undefined : Number(v)),
        z.number({ invalid_type_error: `${f.label} doit être un nombre` }).optional(),
      );
      return f.required
        ? base.refine((v) => v !== undefined, { message: `${f.label} est requis` })
        : base;
    }
    case 'boolean':
      return z.boolean().optional();
    case 'tags':
    case 'multiselect':
    case 'list':
      return z.array(z.string()).optional();
    case 'object':
      return z.record(z.string(), z.any()).optional();
    default: {
      // text / textarea / rich / select
      const base = z.string();
      return f.required ? base.min(1, `${f.label} est requis`) : base.optional();
    }
  }
}

/** Schéma du formulaire complet (champs de tête + `data` typé par catégorie). */
export function buildFormSchema(schema: CategorySchema) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of schema.fields) shape[f.key] = fieldSchema(f);

  return z.object({
    name: z.string().min(1, 'Le nom est requis'),
    summary: z.string().optional(),
    tags: z.array(z.string()),
    data: z.object(shape),
  });
}

export type EntityFormValues = z.infer<ReturnType<typeof buildFormSchema>>;
