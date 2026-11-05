export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'DB binding não configurado' }), { status: 500 });
    }

    const sql = `
      SELECT 
        mk.id,
        mk.name,
        mk.class_id,
        COALESCE(mkt.label, mk.name) as label
      FROM material_kinds mk
      LEFT JOIN material_kind_translations mkt ON mkt.material_kind_id = mk.id AND mkt.locale = 'pt-BR'
      ORDER BY mk.class_id, label;
    `;

    const { results } = await context.env.DB.prepare(sql).all();

    return new Response(JSON.stringify(results || []), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
