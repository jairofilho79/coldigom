export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { autor, decisoes, total_decisoes } = body || {};

    if (!decisoes || typeof decisoes !== 'object') {
      return new Response(JSON.stringify({ error: 'Payload de decisões inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const count = total_decisoes !== undefined ? total_decisoes : Object.keys(decisoes).length;
    const authorName = autor || 'Irmao';
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jsonStr = JSON.stringify(decisoes);

    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'Binding DB não configurado no Pages Functions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await context.env.DB.prepare(
      `INSERT INTO curadoria_submissoes (id, created_at, autor, total_decisoes, dados_json)
       VALUES (?1, datetime('now'), ?2, ?3, ?4)`
    )
      .bind(id, authorName, count, jsonStr)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: id,
        total_decisoes: count,
        message: 'Decisões sincronizadas com sucesso!',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao processar submissão' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'Binding DB não configurado' }), { status: 500 });
    }
    const { results } = await context.env.DB.prepare(
      `SELECT id, created_at, autor, total_decisoes FROM curadoria_submissoes ORDER BY created_at DESC LIMIT 20`
    ).all();

    return new Response(JSON.stringify({ submissions: results || [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
