export async function onRequestPost(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'DB binding não configurado' }), { status: 500 });
    }

    const { praise_id, material_id } = await context.request.json();
    if (!praise_id || !material_id) {
      return new Response(JSON.stringify({ error: 'Parâmetros praise_id e material_id são obrigatórios' }), { status: 400 });
    }

    // Deletar o material do praise_materials diretamente no D1
    const res = await context.env.DB.prepare(
      `DELETE FROM praise_materials WHERE id = ?1 AND praise_id = ?2`
    ).bind(material_id, praise_id).run();

    return new Response(JSON.stringify({
      success: true,
      praise_id,
      material_id,
      changes: res.meta?.changes ?? 1,
      message: 'Material removido com sucesso no Coldigom!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
