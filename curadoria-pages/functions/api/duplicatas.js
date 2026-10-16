export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'DB binding não configurado' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sql = `
      WITH dupes AS (
        SELECT 
          pm.praise_id,
          pm.material_kind,
          pm.type,
          COUNT(*) as duplicate_count,
          json_group_array(json_object(
            'id', pm.id,
            'type', pm.type,
            'material_kind', pm.material_kind,
            'r2_key', pm.r2_key,
            'file_path_legacy', pm.file_path_legacy,
            'url', pm.url
          )) as materials_json
        FROM praise_materials pm
        GROUP BY pm.praise_id, pm.material_kind, pm.type
        HAVING COUNT(*) > 1
      ),
      praise_tags_agg AS (
        SELECT 
          pt.praise_id,
          GROUP_CONCAT(t.name, ', ') AS praise_tags
        FROM praise_tags pt
        JOIN tags t ON t.id = pt.tag_id
        GROUP BY pt.praise_id
      )
      SELECT 
        d.praise_id,
        d.material_kind AS material_kind_id,
        d.type AS material_type,
        d.duplicate_count,
        d.materials_json,
        p.name AS praise_name,
        COALESCE(p.number, '') AS praise_number,
        COALESCE(pta.praise_tags, '') AS praise_tags,
        COALESCE(mkt.label, mk.name) AS material_kind_label,
        mk.name AS material_kind_name,
        cd.action AS saved_action,
        cd.note AS saved_note
      FROM dupes d
      JOIN praises p ON p.id = d.praise_id
      JOIN material_kinds mk ON mk.id = d.material_kind
      LEFT JOIN material_kind_translations mkt ON mkt.material_kind_id = mk.id AND mkt.locale = 'pt-BR'
      LEFT JOIN praise_tags_agg pta ON pta.praise_id = p.id
      LEFT JOIN curadoria_decisoes cd ON (cd.group_key = (d.praise_id || ':' || d.material_kind || ':' || d.type) OR cd.group_key = (d.praise_id || '_' || d.material_kind || '_' || d.type))
      ORDER BY 
        CASE WHEN p.number IS NOT NULL AND p.number != '' THEN CAST(p.number AS INTEGER) ELSE 999999 END,
        p.name;
    `;

    const { results } = await context.env.DB.prepare(sql).all();

    const items = (results || []).map((row) => {
      let materials = [];
      try {
        materials = JSON.parse(row.materials_json);
      } catch (e) {
        materials = [];
      }

      materials = materials.map((m) => ({
        ...m,
        asset_url: `https://coldigom-web.pages.dev/assets/praises/${row.praise_id}/${m.id}.${m.type}`,
      }));

      const group_key = `${row.praise_id}:${row.material_kind_id}:${row.material_type}`;

      return {
        group_key,
        praise_id: row.praise_id,
        praise_name: row.praise_name,
        praise_number: row.praise_number,
        praise_tags: row.praise_tags,
        material_kind_id: row.material_kind_id,
        material_kind_label: row.material_kind_label,
        material_kind_name: row.material_kind_name,
        material_type: row.material_type,
        duplicate_count: row.duplicate_count,
        saved_action: row.saved_action || null,
        saved_note: row.saved_note || '',
        materials,
      };
    });

    return new Response(JSON.stringify(items), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
