export async function onRequestPost(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'DB binding não configurado' }), { status: 500 });
    }

    const { group_key, praise_id, material_kind_id, material_type, action, note } = await context.request.json();
    if (!group_key || !praise_id || !action) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), { status: 400 });
    }

    if (action === 'limpar') {
      await context.env.DB.prepare(
        `DELETE FROM curadoria_decisoes WHERE group_key = ?1`
      ).bind(group_key).run();
      return new Response(JSON.stringify({ success: true, action: 'limpar' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await context.env.DB.prepare(
      `INSERT INTO curadoria_decisoes (group_key, praise_id, material_kind_id, material_type, action, note, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
       ON CONFLICT(group_key) DO UPDATE SET action=excluded.action, note=excluded.note, updated_at=excluded.updated_at`
    ).bind(
      group_key,
      praise_id,
      material_kind_id || '',
      material_type || '',
      action,
      note || ''
    ).run();

    return new Response(JSON.stringify({ success: true, group_key, action }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
