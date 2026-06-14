/**
 * EntityRepository — point d'entrée UNIQUE de l'UI pour le contenu.
 *
 * Règle d'or offline-first : on lit/écrit TOUJOURS le local (Dexie) d'abord,
 * puis on enregistre l'intention de sync dans l'outbox. La sync réseau se fait
 * en arrière-plan via le SyncEngine. L'UI reste instantanée et fonctionne
 * sans réseau.
 */

import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db/local-db';
import type {
  EntityKind,
  EntityRecord,
  SearchFilters,
} from '@/types/domain';

export const entityRepository = {
  async get(id: string): Promise<EntityRecord | undefined> {
    return db.entities.get(id);
  },

  async listByCategory(categoryId: string): Promise<EntityRecord[]> {
    return db.entities
      .where('categoryId')
      .equals(categoryId)
      .filter((e) => !e.deletedAt)
      .toArray();
  },

  /**
   * Résout l'entité "effective" pour l'utilisateur : si un override perso
   * existe pour cette source, on le renvoie à la place de la source.
   */
  async resolveForUser(
    sourceId: string,
    userId: string,
  ): Promise<EntityRecord | undefined> {
    const override = await db.entities
      .where('parentId')
      .equals(sourceId)
      .filter((e) => e.kind === 'override' && e.ownerId === userId && !e.deletedAt)
      .first();
    return override ?? db.entities.get(sourceId);
  },

  /** Liste les variantes d'une source. */
  async variantsOf(sourceId: string): Promise<EntityRecord[]> {
    return db.entities
      .where('parentId')
      .equals(sourceId)
      .filter((e) => e.kind === 'variant' && !e.deletedAt)
      .toArray();
  },

  /**
   * Crée / met à jour une entité utilisateur (optimiste + outbox).
   * L'entrée d'outbox est CLÉE par entité (`upsert:<id>`) : les sauvegardes
   * répétées (autosave) se condensent en une seule opération en attente,
   * et `baseRev` reste la rev de référence pour la détection de conflit.
   */
  async save(entity: EntityRecord): Promise<EntityRecord> {
    const next: EntityRecord = {
      ...entity,
      updatedAt: new Date().toISOString(),
      _syncState: 'pending',
    };
    await db.transaction('rw', db.entities, db.outbox, async () => {
      await db.entities.put(next);
      await db.outbox.put({
        id: `upsert:${next.id}`,
        op: 'upsert',
        entityId: next.id,
        baseRev: next.rev,
        payload: next,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    });
    return next;
  },

  /** Construit (sans persister) une fiche vierge pour une catégorie. */
  blank(categoryId: string, ownerId: string): EntityRecord {
    const now = new Date().toISOString();
    return {
      id: uuid(),
      categoryId,
      ownerId,
      kind: 'custom',
      visibility: 'private',
      parentId: null,
      name: 'Nouvelle fiche',
      summary: '',
      data: {},
      tags: [],
      rev: 1,
      isDefaultVariant: false,
      createdAt: now,
      updatedAt: now,
      _syncState: 'pending',
    };
  },

  /** Duplique une entité (fork) en `custom`, `variant` ou `override`. */
  async fork(
    source: EntityRecord,
    userId: string,
    kind: Exclude<EntityKind, 'source'>,
    overrides: Partial<EntityRecord> = {},
  ): Promise<EntityRecord> {
    const forked: EntityRecord = {
      ...source,
      id: uuid(),
      ownerId: userId,
      kind,
      visibility: 'private',
      parentId: kind === 'custom' ? null : source.id,
      rev: 1,
      isDefaultVariant: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
    return this.save(forked);
  },

  /** "Restaurer l'original" : supprime l'override perso d'une source. */
  async restoreOriginal(overrideId: string): Promise<void> {
    await db.transaction('rw', db.entities, db.outbox, async () => {
      await db.entities.update(overrideId, {
        deletedAt: new Date().toISOString(),
        _syncState: 'pending',
      });
      // Un éventuel upsert en attente devient caduc.
      await db.outbox.delete(`upsert:${overrideId}`);
      await db.outbox.put({
        id: `delete:${overrideId}`,
        op: 'delete',
        entityId: overrideId,
        baseRev: 0,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    });
  },

  /**
   * Résout un conflit en gardant MA version : on re-pousse en se basant sur la
   * rev distante (donc l'upsert sera accepté), en écrasant le distant.
   */
  async resolveKeepLocal(id: string): Promise<void> {
    const e = await db.entities.get(id);
    if (!e) return;
    const baseRev = e._remote?.rev ?? e.rev;
    const merged: EntityRecord = {
      ...e,
      rev: baseRev,
      _remote: null,
      _syncState: 'pending',
      updatedAt: new Date().toISOString(),
    };
    await db.transaction('rw', db.entities, db.outbox, async () => {
      await db.entities.put(merged);
      await db.outbox.put({
        id: `upsert:${id}`,
        op: 'upsert',
        entityId: id,
        baseRev,
        payload: merged,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    });
  },

  /** Résout un conflit en gardant la version DISTANTE (on adopte le serveur). */
  async resolveKeepRemote(id: string): Promise<void> {
    const e = await db.entities.get(id);
    if (!e?._remote) return;
    await db.transaction('rw', db.entities, db.outbox, async () => {
      await db.entities.put({ ...e._remote!, _remote: null, _syncState: 'synced' });
      await db.outbox.delete(`upsert:${id}`);
    });
  },

  /** Recherche locale simple (sera doublée par MiniSearch — cf. lib/search). */
  async filter(filters: SearchFilters): Promise<EntityRecord[]> {
    let coll = db.entities.toCollection();
    coll = coll.filter((e) => !e.deletedAt);
    if (filters.kind) coll = coll.filter((e) => e.kind === filters.kind);
    if (filters.tags?.length)
      coll = coll.filter((e) => filters.tags!.every((t) => e.tags.includes(t)));
    return coll.toArray();
  },
};
