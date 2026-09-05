/* ============================================================
   VERSUS · Gestor — capa de datos sobre Firebase (sin servidor)
   Reemplaza al backend Node: el frontend llama api('/api/...') y
   aquí lo resolvemos leyendo/escribiendo TU Firebase por REST.
   - Datos del gestor: vsportal/gestor/*  (NO toca db ni creds)
   - Lee métricas/pauta/logos de: vsportal/{publications,pauta,brandCfg}
   ============================================================ */
(function () {
  const RTDB = 'https://versus-portal-default-rtdb.firebaseio.com/vsportal';
  const SESS = 'versus_gestor_sesion';

  /* ---- Firebase REST ---- */
  async function fbGet(path) {
    const r = await fetch(`${RTDB}/${path}.json`);
    if (!r.ok) throw new Error('fb get ' + r.status);
    return r.json();
  }
  async function fbPut(path, data) {
    const r = await fetch(`${RTDB}/${path}.json`, { method: 'PUT', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('fb put ' + r.status);
    return r.json();
  }
  async function fbPatch(path, data) {
    const r = await fetch(`${RTDB}/${path}.json`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('fb patch ' + r.status);
    return r.json();
  }
  async function fbDelete(path) {
    const r = await fetch(`${RTDB}/${path}.json`, { method: 'DELETE' });
    if (!r.ok) throw new Error('fb del ' + r.status);
    return true;
  }
  const uid = () => 'z' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /* ---- utilidades (portadas de firebase-data.js) ---- */
  function num(v) {
    let s = String(v == null ? '' : v).trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(/[^\d.-]/g, '');
    const n = Number(s); return isFinite(n) ? n : 0;
  }
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function clasificar(v, med) {
    if (!med) return { nivel: 'sin_base', factor: 1 };
    const f = v / med; let nivel = 'normal';
    if (f < 0.5) nivel = 'muy_bajo'; else if (f < 0.8) nivel = 'bajo';
    else if (f <= 1.25) nivel = 'normal'; else if (f <= 1.8) nivel = 'alto'; else nivel = 'muy_alto';
    return { nivel, factor: Math.round(f * 100) / 100 };
  }
  function brandName(slug, cfg) {
    const c = (cfg || {})[slug];
    if (c && (c.name || c.nombre)) return c.name || c.nombre;
    return String(slug || '').replace(/^drink/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }

  /* ---- caché de lecturas del portal ---- */
  let _cache = { at: 0, pubs: null, brandCfg: null };
  async function portal(force) {
    if (!force && _cache.pubs && Date.now() - _cache.at < 300000) return _cache;
    const [pubsRaw, brandCfg] = await Promise.all([fbGet('db/publications').catch(() => null), fbGet('db/brandCfg').catch(() => ({}))]);
    const pubs = (Array.isArray(pubsRaw) ? pubsRaw : Object.values(pubsRaw || {})).filter(Boolean);
    _cache = { at: Date.now(), pubs, brandCfg: brandCfg || {} };
    return _cache;
  }

  /* ---- PIEZAS (gestor) con semilla la primera vez ---- */
  async function piezasAll() {
    let obj = await fbGet('gestor/piezas').catch(() => null);
    if (!obj) {
      // Semilla desde el archivo del repo (una sola vez).
      try {
        const seed = await fetch('/seed-piezas.json').then(r => r.json());
        const map = {}; seed.forEach(p => { map[p.id] = Object.assign({ comentarios: {}, createdAt: new Date().toISOString() }, p); });
        await fbPut('gestor/piezas', map).catch(() => {});
        obj = map;
      } catch (_) { obj = {}; }
    }
    return Object.values(obj || {}).map(normPieza);
  }
  function normPieza(p) {
    return {
      id: p.id, marca: p.marca, tipo: p.tipo || 'Reel', idea: p.idea || '', guion: p.guion || '',
      caracteristicas: p.caracteristicas || '', etapa: p.etapa || 'idea', responsable: p.responsable || '',
      fecha: p.fecha || null,
      comentarios: p.comentarios ? (Array.isArray(p.comentarios) ? p.comentarios : Object.values(p.comentarios)) : []
    };
  }
  const ETAPAS = [
    { slug: 'idea', label: 'Idea', area: 'Estrategia' }, { slug: 'aprobada', label: 'Aprobada', area: 'Estrategia' },
    { slug: 'grabada', label: 'Grabada', area: 'Producción' }, { slug: 'editada', label: 'Editada', area: 'Creativa' },
    { slug: 'publicada', label: 'Publicada', area: 'Community' }
  ];
  async function board() {
    const piezas = await piezasAll();
    const cols = {}; ETAPAS.forEach(e => cols[e.slug] = []);
    piezas.forEach(p => (cols[p.etapa] || cols.idea).push(p));
    return { etapas: ETAPAS, columnas: cols, total: piezas.length };
  }

  /* ---- LOGOS desde brandCfg (como data URI) ---- */
  async function logos() {
    const { brandCfg } = await portal();
    const out = [];
    for (const slug of Object.keys(brandCfg || {})) {
      const b = brandCfg[slug] || {};
      const uri = (typeof b.logoDark === 'string' && b.logoDark.startsWith('data:')) ? b.logoDark
        : (typeof b.logoLight === 'string' && b.logoLight.startsWith('data:')) ? b.logoLight : null;
      if (uri) out.push({ slug, dataUri: uri });
    }
    return out;
  }

  /* ---- MÉTRICAS ---- */
  async function metricas(force) {
    const { pubs, brandCfg, at } = await portal(force);
    const porMarca = {};
    for (const p of pubs) { const s = p.brand || 'sin-marca'; (porMarca[s] || (porMarca[s] = [])).push(p); }
    const marcas = Object.entries(porMarca).map(([slug, list]) => {
      const medViews = median(list.map(p => num(p.views)).filter(v => v > 0));
      const medLikes = median(list.map(p => num(p.likes)).filter(v => v > 0));
      const items = list.map(p => {
        const v = num(p.views), l = num(p.likes);
        return {
          id: p.id, desc: p.desc || '(sin descripción)', type: p.type || p.tipo || '', platform: p.platform || '',
          date: p.date || '', link: p.link || '', views: v, likes: l, comments: num(p.comments), shares: num(p.shares), saved: num(p.saved),
          engagement: v ? Math.round((l + num(p.comments) + num(p.shares) + num(p.saved)) / v * 1000) / 10 : 0,
          nivel: clasificar(v, medViews).nivel, factor: clasificar(v, medViews).factor
        };
      }).sort((a, b) => b.views - a.views);
      return {
        marca: brandName(slug, brandCfg), slug, total: list.length, medianaViews: Math.round(medViews), medianaLikes: Math.round(medLikes),
        mejores: items.slice(0, 3), peores: items.filter(i => i.views > 0).slice(-3).reverse(), items
      };
    }).filter(m => m.total >= 3).sort((a, b) => b.total - a.total);
    return { actualizado: at, marcas, totalPublicaciones: pubs.length };
  }

  /* ---- PAUTA ---- */
  async function pauta(force) {
    const { brandCfg } = await portal(force);
    const raw = await fbGet('db/pauta').catch(() => []);
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    const by = {};
    for (const r of list) {
      if (!r || !r.brand) continue;
      const g = by[r.brand] || (by[r.brand] = { slug: r.brand, marca: brandName(r.brand, brandCfg), registros: 0, invertido: 0, dias: 0, alcance: 0, clicks: 0, anuncios: 0, periodos: [] });
      g.registros++; g.invertido += num(r.investment); g.dias += num(r.days); g.alcance += num(r.reach || r.alcance_pauta); g.clicks += num(r.clicks); g.anuncios += num(r.anuncios);
      if (r.period) g.periodos.push(String(r.period));
    }
    const marcas = Object.values(by).map(g => ({
      slug: g.slug, marca: g.marca, registros: g.registros, invertido: Math.round(g.invertido), alcance: Math.round(g.alcance),
      clicks: Math.round(g.clicks), anuncios: g.anuncios, gastoSemana: g.dias ? Math.round(g.invertido / g.dias * 7) : 0,
      ultimoPeriodo: g.periodos[g.periodos.length - 1] || ''
    })).sort((a, b) => b.invertido - a.invertido);
    const cfg = (await fbGet('gestor/config/pauta').catch(() => null)) || { moneda: 'COP', trm: 4000 };
    return { marcas, total: marcas.reduce((s, m) => s + m.invertido, 0), gastoSemanaTotal: marcas.reduce((s, m) => s + m.gastoSemana, 0), cfg };
  }

  /* ---- SESIÓN (login casero, prototipo) ---- */
  function getSesion() { try { return JSON.parse(localStorage.getItem(SESS) || 'null'); } catch (_) { return null; } }
  async function teamUsers() {
    let u = await fbGet('gestor/team/users').catch(() => null);
    if (!u) { u = { versus_admin: { name: 'Versus Admin', pass: 'VERSUS2026', area: 'Administrativa', role: 'admin' } }; await fbPut('gestor/team/users', u).catch(() => {}); }
    return u;
  }
  async function login(username, password) {
    const users = await teamUsers();
    const key = String(username || '').trim();
    const u = users[key] || users[key.toLowerCase()];
    if (!u || u.pass !== password) return { ok: false, data: { error: 'Usuario o contraseña incorrectos' } };
    const sesion = { username: key, name: u.name || key, area: u.area || '', role: u.role || 'miembro' };
    try { localStorage.setItem(SESS, JSON.stringify(sesion)); } catch (_) {}
    return { ok: true, data: { ok: true, name: sesion.name } };
  }

  const META = {
    niches: [{ slug: 'general', label: 'General' }, { slug: 'moda', label: 'Moda' }, { slug: 'comida', label: 'Comida' }, { slug: 'tech', label: 'Tecnología' }, { slug: 'salud', label: 'Salud' }, { slug: 'inmobiliario', label: 'Inmobiliario' }, { slug: 'legal', label: 'Legal' }],
    countries: [{ code: 'co', label: 'Colombia' }, { code: 'mx', label: 'México' }, { code: 'us', label: 'Estados Unidos' }, { code: 'es', label: 'España' }, { code: 'ar', label: 'Argentina' }],
    contentCategories: [{ slug: 'educativo', label: 'Educativo' }, { slug: 'entretenimiento', label: 'Entretenimiento' }, { slug: 'venta', label: 'Venta' }, { slug: 'inspiracion', label: 'Inspiración' }]
  };

  /* ============ ROUTER: api('/api/...') ============ */
  async function api(path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body || {};
    const [p, qs] = path.split('?');
    const q = new URLSearchParams(qs || '');
    try {
      // ---- Auth ----
      if (p === '/api/login' && method === 'POST') return await login(body.username, body.password);
      if (p === '/api/logout') { try { localStorage.removeItem(SESS); } catch (_) {} return { ok: true, data: { ok: true } }; }
      if (p === '/api/me') {
        const s = getSesion();
        if (!s) return { ok: true, data: { authenticated: false } };
        return { ok: true, data: { authenticated: true, name: s.name, area: s.area, role: s.role, aiEnabled: !!window.VFB_GEMINI, provider: window.VFB_GEMINI ? 'gemini' : null } };
      }
      if (p === '/api/meta') return { ok: true, data: META };

      // ---- Equipo (tareas) — fase posterior: por ahora vacío ----
      if (p === '/api/team/mytasks') { const s = getSesion() || {}; return { ok: true, data: { tasks: [], me: { name: s.name, area: s.area, role: s.role } } }; }
      if (p.startsWith('/api/team/')) return { ok: true, data: { people: [], areas: [], tasks: [], resumen: {} } };

      // ---- Piezas ----
      if (p === '/api/piezas') return { ok: true, data: await board() };
      if (p === '/api/piezas/crear' && method === 'POST') {
        const id = uid();
        const pieza = { id, marca: String(body.marca || '').trim() || 'Sin marca', tipo: body.tipo || 'Reel', idea: String(body.idea || '').trim() || 'Nueva idea', guion: body.guion || '', caracteristicas: body.caracteristicas || '', etapa: 'idea', responsable: body.responsable || '', fecha: body.fecha || null, comentarios: {}, createdAt: new Date().toISOString() };
        await fbPut('gestor/piezas/' + id, pieza);
        return { ok: true, data: { ok: true, pieza } };
      }
      if (p === '/api/piezas/update' && method === 'POST') {
        const patch = {}; ['idea', 'guion', 'caracteristicas', 'responsable', 'tipo', 'fecha'].forEach(k => { if (body[k] != null) patch[k] = body[k]; });
        await fbPatch('gestor/piezas/' + body.id, patch);
        return { ok: true, data: { ok: true } };
      }
      if (p === '/api/piezas/etapa' && method === 'POST') {
        await fbPatch('gestor/piezas/' + body.id, { etapa: body.etapa });
        await fbPost('gestor/piezas/' + body.id + '/comentarios', { autor: 'sistema', texto: 'Movida a ' + body.etapa, fecha: new Date().toISOString(), sistema: true });
        const p2 = normPieza(await fbGet('gestor/piezas/' + body.id));
        return { ok: true, data: { ok: true, pieza: p2 } };
      }
      if (p === '/api/piezas/comentario' && method === 'POST') {
        const s = getSesion() || {};
        await fbPost('gestor/piezas/' + body.id + '/comentarios', { autor: s.name || 'Equipo', texto: String(body.texto || '').trim(), fecha: new Date().toISOString() });
        const p2 = normPieza(await fbGet('gestor/piezas/' + body.id));
        return { ok: true, data: { ok: true, pieza: p2 } };
      }
      if (p === '/api/piezas/remove' && method === 'POST') { await fbDelete('gestor/piezas/' + body.id); return { ok: true, data: { ok: true } }; }

      // ---- Marcas ----
      if (p === '/api/marca/lista' || p === '/api/archivos') {
        const marcas = await fetch('/seed-marcas.json').then(r => r.json()).catch(() => []);
        return { ok: true, data: { marcas } };
      }
      if (p === '/api/marca/logos') return { ok: true, data: { logos: await logos() } };
      if (p === '/api/marca/contexto') {
        const marca = q.get('marca') || body.marca || '';
        if (method === 'POST') { const c = { tono: String(body.tono || '').trim(), publico: String(body.publico || '').trim(), notas: String(body.notas || '').trim() }; await fbPut('gestor/marcas/' + fbKey(marca) + '/contexto', c); return { ok: true, data: { ok: true } }; }
        const c = (await fbGet('gestor/marcas/' + fbKey(marca) + '/contexto').catch(() => null)) || { tono: '', publico: '', notas: '' };
        return { ok: true, data: c };
      }
      if (p === '/api/marca/aprendizaje') {
        const marca = q.get('marca') || body.marca || '';
        if (method === 'POST') { const item = { id: uid(), kind: body.kind || 'nota', texto: String(body.texto || '').trim(), fuente: body.fuente || '', at: new Date().toISOString() }; await fbPut('gestor/marcas/' + fbKey(marca) + '/aprendizaje/' + item.id, item); return { ok: true, data: { ok: true, item } }; }
        const obj = (await fbGet('gestor/marcas/' + fbKey(marca) + '/aprendizaje').catch(() => null)) || {};
        return { ok: true, data: { entries: Object.values(obj).sort((a, b) => (b.at || '').localeCompare(a.at || '')) } };
      }
      if (p === '/api/marca/aprendizaje/remove' && method === 'POST') { await fbDelete('gestor/marcas/' + fbKey(body.marca) + '/aprendizaje/' + body.id); return { ok: true, data: { ok: true } }; }
      if (p === '/api/marca/aprendizaje/buscar' && method === 'POST') { return { ok: true, data: { ok: true, agregados: 0, entries: [] } }; } // fase IA

      // ---- Métricas / Pauta ----
      if (p === '/api/metricas') return { ok: true, data: await metricas(q.get('refresh') === '1') };
      if (p === '/api/pauta') return { ok: true, data: await pauta(q.get('refresh') === '1') };
      if (p === '/api/pauta/moneda' && method === 'POST') { const cfg = { moneda: body.moneda === 'USD' ? 'USD' : 'COP', trm: parseInt(body.trm, 10) || 4000 }; await fbPut('gestor/config/pauta', cfg); return { ok: true, data: cfg }; }
      if (p === '/api/metricas/analisis' && method === 'POST') return { ok: true, data: aiDemoAnalisis(body) };

      // ---- Archivos (Drive link + subida a fase posterior con Storage) ----
      if (p === '/api/archivos/marca') {
        const marca = q.get('m') || '';
        const e = (await fbGet('gestor/marcas/' + fbKey(marca) + '/archivos').catch(() => null)) || { drive: '', files: {} };
        return { ok: true, data: { marca, drive: e.drive || '', files: Object.values(e.files || {}) } };
      }
      if (p === '/api/archivos/drive' && method === 'POST') { await fbPut('gestor/marcas/' + fbKey(body.marca) + '/archivos/drive', String(body.url || '').trim()); return { ok: true, data: { ok: true } }; }
      if (p === '/api/archivos/upload' && method === 'POST') return { ok: true, data: { ok: false, error: 'La subida de archivos se activa en la siguiente fase (Firebase Storage).' } };
      if (p === '/api/archivos/remove' && method === 'POST') { await fbDelete('gestor/marcas/' + fbKey(body.marca || '') + '/archivos/files/' + body.id).catch(() => {}); return { ok: true, data: { ok: true } }; }

      // ---- Gestión / IA (fases posteriores) ----
      if (p === '/api/ideas' || p === '/api/captions' || p === '/api/hashtags' || p === '/api/historias') return { ok: true, data: aiDemo(p, body) };
      if (p.startsWith('/api/gestion')) return { ok: true, data: { marcas: [], area: null, porGrabar: [], grabado: [], items: [] } };
      if (p === '/api/radar') return { ok: true, data: { items: [] } };

      return { ok: false, status: 404, data: { error: 'Ruta no disponible en modo Firebase: ' + p } };
    } catch (e) {
      return { ok: false, status: 500, data: { error: String(e.message || e) } };
    }
  }

  async function fbPost(path, data) { // push con clave
    const id = uid();
    await fbPut(path + '/' + id, data);
    return id;
  }
  function fbKey(s) { return String(s || '').replace(/[.#$/\[\]]/g, '_').trim() || 'marca'; }

  /* ---- Demos de IA (hasta conectar Gemini por función) ---- */
  function aiDemo(p, b) {
    const t = (b.tema || b.topic || 'tu tema');
    if (p === '/api/historias') return { source: 'demo', historias: [
      { frame: 1, texto: `Para si te pasa esto con ${t} 👀`, elemento: 'encuesta (Sí / No)', objetivo: 'Frenar el dedo.' },
      { frame: 2, texto: `Nadie te lo explica así sobre ${t}.`, elemento: '', objetivo: 'Abrir el loop.' },
      { frame: 3, texto: `Haz esto en su lugar 👇`, elemento: 'pregunta', objetivo: 'Entregar el tip.' },
      { frame: 4, texto: `¿Quieres la guía? Desliza 👆`, elemento: 'sticker de link', objetivo: 'Conversión.' }
    ] };
    if (p === '/api/hashtags') return { source: 'demo', grupos: { alcance: [{ tag: '#' + t.replace(/\s+/g, ''), nota: 'tema', alcance: 'alto' }], nicho: [], comunidad: [] } };
    if (p === '/api/ideas') return { source: 'demo', ideas: [{ titulo: `${t}: el ángulo que nadie usa`, hook: `Nadie te dice esto de ${t}…`, estructura: 'Hook → 3 puntos → CTA', formato: 'Reel', por_que_funciona: 'Estructura probada.', cta: 'Guarda / sigue' }] };
    return { source: 'demo', captions: [{ angulo: 'Demo', texto: `Caption de ejemplo sobre ${t}. Conecta Gemini para captions reales con la línea de aprendizaje.`, hashtags: ['#' + t.replace(/\s+/g, '')] }] };
  }
  function aiDemoAnalisis(b) { return { source: 'demo', diagnostico: 'Conecta Gemini para el análisis real.', que_repetir: [], que_evitar: [], acciones: [] }; }

  window.VFB = { api, fbGet, fbPut };
})();
