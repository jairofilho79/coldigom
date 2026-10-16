export async function onRequestPost(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'DB binding não configurado' }), { status: 500 });
    }

    const { praise_id, material_id, material_kind } = await context.request.json();
    if (!praise_id || !material_id || !material_kind) {
      return new Response(JSON.stringify({ error: 'Parâmetros praise_id, material_id e material_kind são obrigatórios' }), { status: 400 });
    }

    // Atualizar material_kind no praise_materials diretamente no D1
    const res = await context.env.DB.prepare(
      `UPDATE praise_materials SET material_kind = ?1 WHERE id = ?2 AND praise_id = ?3`
    ).bind(material_kind, material_id, praise_id).run();

    return new Response(JSON.stringify({
      success: true,
      praise_id,
      material_id,
      material_kind,
      changes: res.meta?.changes ?? 1,
      message: 'Categoria do material atualizada com sucesso no Coldigom!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
