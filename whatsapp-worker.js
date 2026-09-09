/**
 * Versus · Worker de notificaciones por WhatsApp (Cloudflare Worker)
 * ------------------------------------------------------------------
 * Oculta el token de Meta. El portal solo le manda un texto; el Worker
 * decide a QUIÉN se envía (número configurado por ti), así nadie puede
 * usarlo para escribirle a terceros.
 *
 * CÓMO DESPLEGARLO
 * 1) En Cloudflare → Workers → Create Worker. Pega este archivo. Deploy.
 * 2) En Settings → Variables and Secrets, agrega (como "Secret"):
 *      WA_TOKEN     = token permanente de WhatsApp Cloud API (Meta)
 *      WA_PHONE_ID  = "Phone number ID" del número emisor (Meta)
 *      WA_TO        = número(s) destino con código de país, sin +, sin espacios.
 *                     Ej: 573001112233   (varios: sepáralos con coma)
 *      WA_TEMPLATE  = nombre de tu plantilla aprobada (ej: versus_aviso)
 *                     Déjalo VACÍO para enviar texto libre (solo funciona
 *                     dentro de la ventana de 24h tras un mensaje del destinatario).
 *      WA_LANG      = idioma de la plantilla (ej: es  o  es_CO). Por defecto es.
 *      WA_ALLOW_ORIGIN = https://portal.versusstudio.co  (para CORS)
 * 3) Copia la URL del Worker (…workers.dev) y pásamela para conectarla al portal.
 *
 * PLANTILLA (WA_TEMPLATE): en Meta → WhatsApp → Manage templates, crea una
 * de categoría "Utility", idioma español, con el CUERPO exactamente:  {{1}}
 * (o "Versus: {{1}}"). Meta la aprueba normalmente en minutos.
 */

const GRAPH = 'https://graph.facebook.com/v20.0';

function cors(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.WA_ALLOW_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(obj, status, env) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors(env) } });
}

async function sendTo(to, text, env) {
  const lang = env.WA_LANG || 'es';
  let body;
  if (env.WA_TEMPLATE) {
    body = {
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: env.WA_TEMPLATE, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(text).slice(0, 900) }] }] }
    };
  } else {
    body = { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(text).slice(0, 3900) } };
  }
  const r = await fetch(`${GRAPH}/${env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.WA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (request.method !== 'POST') return json({ ok: false, error: 'Usa POST' }, 405, env);
    if (!env.WA_TOKEN || !env.WA_PHONE_ID || !env.WA_TO) return json({ ok: false, error: 'Faltan variables WA_TOKEN / WA_PHONE_ID / WA_TO' }, 500, env);

    let payload = {};
    try { payload = await request.json(); } catch (_) {}
    const text = (payload && payload.text ? String(payload.text) : '').trim();
    if (!text) return json({ ok: false, error: 'Falta el texto' }, 400, env);

    const destinos = String(env.WA_TO).split(',').map(s => s.trim()).filter(Boolean);
    const resultados = [];
    for (const to of destinos) {
      try { resultados.push(await sendTo(to, text, env)); }
      catch (e) { resultados.push({ ok: false, error: String(e && e.message || e) }); }
    }
    const okAll = resultados.every(r => r.ok);
    return json({ ok: okAll, resultados }, okAll ? 200 : 502, env);
  }
};
