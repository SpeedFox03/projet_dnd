-- =============================================================================
-- RPC upsert_entity : écriture d'une entité avec contrôle de concurrence.
-- Le client envoie l'entité + la `rev` sur laquelle il s'est basé (p_base_rev).
-- - Insert si l'entité n'existe pas.
-- - Update seulement si la rev courante == p_base_rev (sinon -> conflit).
-- - Snapshot dans entity_versions et incrément de rev à chaque écriture.
-- SECURITY INVOKER : la RLS de `entities` s'applique (l'utilisateur ne peut
-- écrire que ses propres entités).
-- =============================================================================

create or replace function upsert_entity(p_entity jsonb, p_base_rev integer)
returns entities
language plpgsql
security invoker
as $$
declare
  v_id        uuid := (p_entity->>'id')::uuid;
  v_current   entities;
  v_result    entities;
begin
  select * into v_current from entities where id = v_id;

  if not found then
    -- Insertion (rev = 1)
    insert into entities (
      id, category_id, owner_id, kind, visibility, parent_id,
      name, summary, data, patch, tags, license, source_name,
      is_default_variant, deleted_at, rev
    ) values (
      v_id,
      (p_entity->>'category_id')::uuid,
      auth.uid(),                         -- forcé : on n'écrit que pour soi
      (p_entity->>'kind')::entity_kind,
      coalesce((p_entity->>'visibility')::visibility, 'private'),
      nullif(p_entity->>'parent_id','')::uuid,
      p_entity->>'name',
      p_entity->>'summary',
      coalesce(p_entity->'data', '{}'::jsonb),
      p_entity->'patch',
      coalesce((select array_agg(value) from jsonb_array_elements_text(p_entity->'tags')), '{}'),
      p_entity->>'license',
      p_entity->>'source_name',
      coalesce((p_entity->>'is_default_variant')::boolean, false),
      nullif(p_entity->>'deleted_at','')::timestamptz,
      1
    )
    returning * into v_result;
  else
    -- Contrôle de concurrence optimiste
    if v_current.rev <> p_base_rev then
      raise exception 'CONFLICT: rev % attendue, % en base', p_base_rev, v_current.rev
        using errcode = 'P0001';
    end if;

    update entities set
      name               = p_entity->>'name',
      summary            = p_entity->>'summary',
      data               = coalesce(p_entity->'data', '{}'::jsonb),
      patch              = p_entity->'patch',
      tags               = coalesce((select array_agg(value) from jsonb_array_elements_text(p_entity->'tags')), '{}'),
      visibility         = coalesce((p_entity->>'visibility')::visibility, v_current.visibility),
      is_default_variant = coalesce((p_entity->>'is_default_variant')::boolean, v_current.is_default_variant),
      deleted_at         = nullif(p_entity->>'deleted_at','')::timestamptz,
      rev                = v_current.rev + 1
    where id = v_id
    returning * into v_result;
  end if;

  -- Snapshot d'historique
  insert into entity_versions (entity_id, rev, name, data, edited_by)
  values (v_result.id, v_result.rev, v_result.name, v_result.data, auth.uid());

  return v_result;
end;
$$;
