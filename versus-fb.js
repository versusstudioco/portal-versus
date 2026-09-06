/* ============================================================
   VERSUS · Gestor — capa de datos sobre Firebase (sin servidor)
   Reemplaza al backend Node: el frontend llama api('/api/...') y
   aquí lo resolvemos leyendo/escribiendo TU Firebase por REST.
   - Datos del gestor: vsportal/gestor/*  (NO toca db ni creds)
   - Lee métricas/pauta/logos de: vsportal/{publications,pauta,brandCfg}
   ============================================================ */
(function () {
  const RTDB = 'https://versus-portal-default-rtdb.firebaseio.com/vsportal';
  const EMAIL_DOM = '@portal.versusstudio.co';
  const FBCFG = { apiKey: 'AIzaSyAKgL0la08wjXBL4VhlcqRlE8Ory1KKC80', authDomain: 'versus-portal.firebaseapp.com', databaseURL: 'https://versus-portal-default-rtdb.firebaseio.com', projectId: 'versus-portal', storageBucket: 'versus-portal.firebasestorage.app', messagingSenderId: '689127935637', appId: '1:689127935637:web:0d42a61192c4e1440b559c' };
  try { if (window.firebase && !firebase.apps.length) firebase.initializeApp(FBCFG); } catch (_) {}
  const _authReady = new Promise(res => { try { firebase.auth().onAuthStateChanged(u => res(u)); } catch (_) { res(null); } });
  async function token() { try { const u = firebase.auth().currentUser; return u ? await u.getIdToken() : null; } catch (_) { return null; } }
  function withAuth(url, t) { return url + (t ? (url.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + t : ''); }
  const AREAS = ['Estrategia', 'Producción', 'Creativa', 'Community', 'Pauta', 'Administrativa'];
  const _secondary = (function () { try { return (firebase.apps || []).find(a => a.name === 'vfbSecondary') || firebase.initializeApp(FBCFG, 'vfbSecondary'); } catch (_) { return null; } })();

  /* ---- IA (Gemini) vía Cloudflare Worker (clave oculta) ---- */
  const GEMINI_URL = 'https://versus-ai.versusestudio-co.workers.dev';
  const GEMINI_MODEL = 'gemini-3.6-flash';
  window.VFB_GEMINI = GEMINI_URL;
  async function callGemini(system, prompt) {
    const r = await fetch(GEMINI_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt, model: GEMINI_MODEL }) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || ('gemini ' + r.status));
    return j.text || '';
  }
  function extractJSON(text) {
    if (!text) return null;
    let t = String(text).trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (_) {}
    const m = t.match(/[{[][\s\S]*[}\]]/);
    if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
    return null;
  }
  // Bloque con el contexto + línea de aprendizaje de ESA marca (independiente por cliente).
  async function marcaBloque(marca) {
    if (!marca) return '';
    let ctx = {}, apObj = {};
    try { ctx = (await fbGet('gestor/marcas/' + fbKey(marca) + '/contexto')) || {}; } catch (_) {}
    try { apObj = (await fbGet('gestor/marcas/' + fbKey(marca) + '/aprendizaje')) || {}; } catch (_) {}
    const ap = Object.values(apObj);
    let b = `\nMARCA: ${marca}`;
    if (ctx.industria) b += `\n- Industria/sector: ${ctx.industria}`;
    if (ctx.pais) b += `\n- País/mercado: ${ctx.pais}`;
    if (ctx.servicios) b += `\n- Servicios/productos: ${ctx.servicios}`;
    if (ctx.tipoClientes) b += `\n- Tipo de clientes: ${ctx.tipoClientes}`;
    if (ctx.publico) b += `\n- Público objetivo: ${ctx.publico}`;
    if (ctx.tono) b += `\n- Tono de voz: ${ctx.tono}`;
    if (ctx.comunicacion) b += `\n- Cómo se comunica la marca: ${ctx.comunicacion}`;
    if (ctx.notas) b += `\n- Notas / do's & don'ts: ${ctx.notas}`;
    if (ap.length) b += `\n- LÍNEA DE APRENDIZAJE de la marca (memoria acumulada, respétala): ${ap.map(x => x.texto).slice(-12).join(' | ')}`;
    b += `\nCada marca es un mundo: adapta TODO a este contexto. Escribe solo en la voz de esta marca.`;
    return b;
  }

  /* ---- Firebase REST (con token de sesión segura) ---- */
  async function fbGet(path) {
    const t = await token();
    const r = await fetch(withAuth(`${RTDB}/${path}.json`, t));
    if (!r.ok) throw new Error('fb get ' + r.status);
    return r.json();
  }
  async function fbPut(path, data) {
    const t = await token();
    const r = await fetch(withAuth(`${RTDB}/${path}.json`, t), { method: 'PUT', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('fb put ' + r.status);
    return r.json();
  }
  async function fbPatch(path, data) {
    const t = await token();
    const r = await fetch(withAuth(`${RTDB}/${path}.json`, t), { method: 'PATCH', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('fb patch ' + r.status);
    return r.json();
  }
  async function fbDelete(path) {
    const t = await token();
    const r = await fetch(withAuth(`${RTDB}/${path}.json`, t), { method: 'DELETE' });
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

  /* ---- SESIÓN con Firebase Authentication (segura) ---- */
  async function login(username, password) {
    const email = String(username || '').trim().toLowerCase() + EMAIL_DOM;
    try { await firebase.auth().signInWithEmailAndPassword(email, password); }
    catch (e) { return { ok: false, data: { error: 'Usuario o contraseña incorrectos' } }; }
    return { ok: true, data: { ok: true } };
  }
  async function sesionActual() {
    const u = firebase.auth().currentUser || await _authReady;
    if (!u) return null;
    const username = (u.email || '').split('@')[0];
    let perfil = null;
    try { perfil = await fbGet('db/profiles/' + username); } catch (_) {}
    perfil = perfil || {};
    const esAdmin = perfil.type === 'admin' || perfil.role === 'admin';
    const area = perfil.area || (perfil.areas && perfil.areas[0]) || (esAdmin ? 'Administrativa' : (perfil.brand || ''));
    return { username, name: perfil.name || username, area, areas: perfil.areas || (area ? [area] : []), role: esAdmin ? 'admin' : (perfil.role || 'miembro'), type: perfil.type || 'client' };
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
      if (p === '/api/logout') { try { await firebase.auth().signOut(); } catch (_) {} return { ok: true, data: { ok: true } }; }
      if (p === '/api/me') {
        const s = await sesionActual();
        if (!s) return { ok: true, data: { authenticated: false } };
        return { ok: true, data: { authenticated: true, name: s.name, area: s.area, role: s.role, aiEnabled: !!window.VFB_GEMINI, provider: window.VFB_GEMINI ? 'gemini' : null } };
      }
      if (p === '/api/meta') return { ok: true, data: META };

      // ---- Equipo / tareas ----
      if (p === '/api/team/mytasks') {
        const s = (await sesionActual()) || {};
        const all = Object.values((await fbGet('gestor/tasks').catch(() => null)) || {});
        const hoyISO = new Date().toISOString().slice(0, 10);
        const mias = all.filter(t => t.assignedTo === s.username).map(t => ({ ...t, overdue: t.status !== 'hecho' && t.dueDate && t.dueDate < hoyISO }));
        return { ok: true, data: { tasks: mias, me: { name: s.name, area: s.area, role: s.role } } };
      }
      if (p === '/api/team/task-status' && method === 'POST') {
        await fbPatch('gestor/tasks/' + body.id, { status: body.status });
        return { ok: true, data: { ok: true } };
      }
      if (p.startsWith('/api/team/admin/')) {
        const s = await sesionActual();
        if (!s || s.role !== 'admin') return { ok: false, status: 403, data: { error: 'Solo el administrador' } };
        const profilesObj = (await fbGet('db/profiles').catch(() => null)) || {};
        const people = Object.entries(profilesObj)
          .filter(([k, v]) => v && (v.type === 'team' || v.type === 'admin' || v.role === 'admin'))
          .map(([k, v]) => ({ id: k, username: k, name: v.name || k, area: v.area || (v.areas && v.areas[0]) || '', role: (v.type === 'admin' || v.role === 'admin') ? 'admin' : 'miembro' }));
        const tasks = Object.values((await fbGet('gestor/tasks').catch(() => null)) || {});
        if (p === '/api/team/admin/people') return { ok: true, data: { people, areas: AREAS } };
        if (p === '/api/team/admin/report') {
          const hoyISO = new Date().toISOString().slice(0, 10);
          const tk = tasks.map(t => ({ ...t, overdue: t.status !== 'hecho' && t.dueDate && t.dueDate < hoyISO }));
          const porPersona = people.map(pe => { const mine = tasks.filter(t => t.assignedTo === pe.username); return { name: pe.name, area: pe.area, total: mine.length, hechas: mine.filter(t => t.status === 'hecho').length }; });
          const porArea = AREAS.map(a => ({ area: a, total: tasks.filter(t => t.area === a).length })).filter(x => x.total);
          return { ok: true, data: { resumen: { personas: people.length, tareas: tasks.length }, tasks: tk, porPersona, porArea } };
        }
        if (p === '/api/team/admin/person' && method === 'POST') {
          const username = String(body.username || '').trim().toLowerCase();
          if (!username || !body.name) return { ok: false, data: { error: 'Falta nombre o usuario' } };
          const isAdmin = body.role === 'admin';
          const area = body.area || '';
          if (body.password) {
            if (String(body.password).length < 6) return { ok: false, data: { error: 'La contraseña debe tener 6 o más caracteres' } };
            try { if (_secondary) { await _secondary.auth().createUserWithEmailAndPassword(username + EMAIL_DOM, body.password); await _secondary.auth().signOut(); } }
            catch (e) { if (e.code !== 'auth/email-already-in-use') return { ok: false, data: { error: e.code || e.message } }; }
          }
          await fbPut('db/profiles/' + username, { name: body.name, type: isAdmin ? 'admin' : 'team', role: isAdmin ? 'admin' : 'miembro', area, areas: area ? [area] : [] });
          return { ok: true, data: { ok: true } };
        }
        if (p === '/api/team/admin/person-remove' && method === 'POST') { await fbDelete('db/profiles/' + body.id); return { ok: true, data: { ok: true } }; }
        if (p === '/api/team/admin/task' && method === 'POST') {
          const id = uid();
          await fbPut('gestor/tasks/' + id, { id, title: body.title || '', assignedTo: body.assignedTo || '', area: body.area || '', cliente: body.cliente || '', dueDate: body.dueDate || null, priority: body.priority || 'media', status: 'pendiente', createdAt: new Date().toISOString() });
          return { ok: true, data: { ok: true } };
        }
        if (p === '/api/team/admin/task-remove' && method === 'POST') { await fbDelete('gestor/tasks/' + body.id); return { ok: true, data: { ok: true } }; }
        return { ok: true, data: { people, areas: AREAS } };
      }
      if (p.startsWith('/api/team/')) return { ok: true, data: { tasks: [] } };

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
        const s = (await sesionActual()) || {};
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
        const CAMPOS = ['industria', 'pais', 'tipoClientes', 'comunicacion', 'servicios', 'tono', 'publico', 'notas'];
        if (method === 'POST') {
          const c = {}; CAMPOS.forEach(k => c[k] = String(body[k] || '').trim());
          await fbPut('gestor/marcas/' + fbKey(marca) + '/contexto', c);
          return { ok: true, data: { ok: true } };
        }
        const saved = (await fbGet('gestor/marcas/' + fbKey(marca) + '/contexto').catch(() => null)) || {};
        const c = {}; CAMPOS.forEach(k => c[k] = saved[k] || '');
        c.completo = !!(c.industria && c.servicios && c.tono);
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
      if (p === '/api/metricas/analisis' && method === 'POST') {
        try {
          const system = 'Eres analista de contenido de Versus Studio. Analizas rendimiento y das recomendaciones accionables en español. Respondes SOLO con JSON válido.';
          const prompt = `Analiza el rendimiento de la marca "${body.marca}". Mediana de views: ${body.medianaViews}. Mejores: ${JSON.stringify((body.mejores || []).map(x => ({ desc: x.desc, views: x.views })))}. Peores: ${JSON.stringify((body.peores || []).map(x => ({ desc: x.desc, views: x.views })))}.\nDevuelve SOLO JSON: {"diagnostico":"2-3 frases","que_repetir":[".."],"que_evitar":[".."],"acciones":["3 acciones concretas"]}`;
          const json = extractJSON(await callGemini(system, prompt));
          if (json) return { ok: true, data: { source: 'ia', ...json } };
        } catch (_) {}
        return { ok: true, data: aiDemoAnalisis(body) };
      }

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
      if (p === '/api/captions' && method === 'POST') {
        const tema = body.topic || body.tema || '';
        try {
          const bloque = await marcaBloque(body.marca);
          const system = 'Eres el director de contenido de Versus Studio, experto en captions que venden. Escribes en español, sin relleno ni frases genéricas. Respondes SOLO con JSON válido.';
          const prompt = `Escribe 3 captions PROFESIONALES y distintos entre sí para ${body.platform || 'instagram'} sobre "${tema}".${bloque}\nCada uno con un ángulo diferente. Devuelve SOLO JSON: {"captions":[{"angulo":"nombre corto","primera_linea":"gancho","texto":"caption completo listo para pegar","hashtags":["#.."],"que_aporta":"","por_que_funciona":""}]}`;
          const json = extractJSON(await callGemini(system, prompt));
          if (json && json.captions) return { ok: true, data: { source: 'ia', captions: json.captions.slice(0, 3) } };
        } catch (_) {}
        return { ok: true, data: aiDemo('/api/captions', body) };
      }
      if (p === '/api/historias' && method === 'POST') {
        const tema = body.tema || body.topic || '';
        try {
          const bloque = await marcaBloque(body.marca);
          const system = 'Eres estratega de HISTORIAS (stories) de Instagram en Versus Studio. Diseñas secuencias que enganchan, con objetivo por frame y elementos interactivos. Español. SOLO JSON válido.';
          const prompt = `Diseña una secuencia de 4-6 historias sobre "${tema}".${bloque}\nEl primer frame frena el dedo; cierra con acción. Devuelve SOLO JSON: {"historias":[{"frame":1,"texto":"lo que va escrito","elemento":"encuesta/pregunta/quiz/link o ''","objetivo":"qué logra"}]}`;
          const json = extractJSON(await callGemini(system, prompt));
          if (json && json.historias) return { ok: true, data: { source: 'ia', historias: json.historias.slice(0, 6) } };
        } catch (_) {}
        return { ok: true, data: aiDemo('/api/historias', body) };
      }
      if (p === '/api/ideas' && method === 'POST') {
        const tema = body.topic || body.tema || '';
        try {
          const bloque = await marcaBloque(body.marca);
          const system = 'Eres estratega de contenido de Versus Studio. Generas ideas de contenido con gancho y estructura. Español. SOLO JSON válido.';
          const prompt = `Genera 5 ideas de contenido sobre "${tema}" para ${body.platform || 'instagram'}.${bloque}\nDevuelve SOLO JSON: {"ideas":[{"titulo":"","hook":"","estructura":"","formato":"Reel/Carrusel/Post","por_que_funciona":"","cta":""}]}`;
          const json = extractJSON(await callGemini(system, prompt));
          if (json && json.ideas) return { ok: true, data: { source: 'ia', ideas: json.ideas.slice(0, 6) } };
        } catch (_) {}
        return { ok: true, data: aiDemo('/api/ideas', body) };
      }
      if (p === '/api/hashtags' && method === 'POST') {
        const tema = body.topic || body.tema || '';
        try {
          const bloque = await marcaBloque(body.marca);
          const system = 'Eres estratega de hashtags de Versus Studio. Español. SOLO JSON válido.';
          const prompt = `Analiza hashtags y palabras clave para "${tema}" (${body.platform || 'instagram'}).${bloque}\nDevuelve SOLO JSON: {"estrategia":"1-2 frases","grupos":{"amplios":[{"tag":"#..","nota":"","alcance":"alto/medio/bajo"}],"nicho":[{"tag":"#..","nota":"","alcance":""}],"longtail":[{"tag":"#..","nota":"","alcance":""}]},"recomendado":["#..","#.."]}`;
          const json = extractJSON(await callGemini(system, prompt));
          if (json && json.grupos) return { ok: true, data: { source: 'ia', ...json } };
        } catch (_) {}
        return { ok: true, data: aiDemo('/api/hashtags', body) };
      }
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
