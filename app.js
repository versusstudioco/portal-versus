/* ===========================================================
   Versus · Agente de contenido — Frontend
   =========================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const state = { meta: null };

const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn' };

async function api(path, opts = {}) {
  // Modo Firebase (estático, sin servidor): lo resuelve versus-fb.js
  if (window.VFB) return window.VFB.api(path, opts);
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ---------------- Auth ---------------- */
async function checkSession() {
  const { ok, data } = await api('/api/me');
  if (ok && data.authenticated) {
    enterApp(data);
  } else {
    show('#login'); hide('#app');
  }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn');
  const err = $('#loginError');
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Entrando…';
  const { ok, data } = await api('/api/login', {
    method: 'POST',
    body: { username: $('#username').value, password: $('#password').value }
  });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (ok) {
    await checkSession();
  } else {
    err.textContent = data.error || 'No se pudo iniciar sesión';
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

async function enterApp(me) {
  hide('#login'); show('#app');
  state.me = me;
  $('#userName').textContent = (me.name || 'Versus') + (me.area ? ' · ' + me.area : '');
  $('.avatar').textContent = (me.name || 'V').trim().charAt(0).toUpperCase();
  if (me.role === 'admin') { $('#navEquipo').classList.remove('hidden'); }
  const badge = $('#aiBadge');
  if (me.aiEnabled) { badge.textContent = '● IA activa' + (me.provider === 'gemini' ? ' · Gemini' : me.provider === 'claude' ? ' · Claude' : ''); badge.className = 'ai-badge on'; }
  else { badge.textContent = '● Modo demo'; badge.className = 'ai-badge demo'; }
  $('#viewTitle').textContent = VIEW_META.inicio[0];
  $('#viewSub').textContent = VIEW_META.inicio[1];
  loadInicio();
  loadMeta(); // en segundo plano, para los selects de las demás vistas
}

/* ---------------- Meta / selects ---------------- */
async function loadMeta() {
  const { data } = await api('/api/meta');
  state.meta = data;
  // Filtros de tendencias
  fillSelect('#fNiche', data.niches, 'slug', 'label', 'Todos');
  fillSelect('#fCountry', data.countries, 'code', 'label', 'Todos');
  fillSelect('#fPlatform', data.platforms.map(p => ({ v: p, l: PLATFORM_LABEL[p] })), 'v', 'l', 'Todas');
  fillSelect('#fType', data.types, 'slug', 'label', 'Orgánico + Ads');
  // Selects de generadores (todos aceptan texto libre en el campo de tema)
  ['#rCountry', '#iCountry', '#hCountry'].forEach(id => fillSelect(id, data.countries, 'code', 'label'));
  ['#iCategory', '#hCategory'].forEach(id => fillSelect(id, data.contentCategories || [], 'slug', 'label', 'Sin tono específico'));
  fillSelect('#rCategory', data.contentCategories || [], 'slug', 'label', 'Sin tono específico');
  fillSelect('#cCountry', data.countries, 'code', 'label');
  fillSelect('#cCategory', data.contentCategories || [], 'slug', 'label', 'Sin tono específico');
  fillSelect('#cObjetivo', data.captionObjectives || [], 'slug', 'label');
  // Marcas (para contexto por cliente en captions)
  api('/api/marca/lista').then(({ data }) => {
    const sel = $('#cMarca');
    if (sel && data.marcas) { data.marcas.forEach(m => { const o = document.createElement('option'); o.value = m.marca; o.textContent = m.marca; sel.appendChild(o); }); }
  });
  initCaptionContext();
  // Chips de sugerencia: atajos, pero el campo acepta cualquier palabra.
  const chips = $('#rChips');
  chips.innerHTML = '<span class="chips__label">Sugerencias:</span>' +
    (data.niches || []).map(n => `<button class="chip" data-topic="${esc(n.label)}">${esc(n.label)}</button>`).join('');
  $$('#rChips .chip').forEach(c => c.addEventListener('click', () => {
    $('#rTopic').value = c.dataset.topic;
    loadRadar(false);
  }));
  ['#iPlatform', '#cPlatform', '#hPlatform'].forEach(id =>
    fillSelect(id, data.platforms.map(p => ({ v: p, l: PLATFORM_LABEL[p] })), 'v', 'l'));
}

function fillSelect(sel, items, valKey, labelKey, allLabel) {
  const el = $(sel);
  el.innerHTML = allLabel ? `<option value="">${allLabel}</option>` : '';
  items.forEach(it => {
    const o = document.createElement('option');
    o.value = it[valKey]; o.textContent = it[labelKey];
    el.appendChild(o);
  });
}

/* ---------------- Navegación ---------------- */
const VIEW_META = {
  inicio: ['Mi día', 'Tu guía de hoy'],
  calendario: ['Calendario', 'Qué sale cada día por marca — el cronograma del ciclo'],
  gestion: ['Gestión de marcas', 'Producción por marca, ciclo mensual y flujo por área'],
  metricas: ['📊 Métricas', 'Rendimiento real por marca — leído del Portal de clientes (Firebase)'],
  archivos: ['Marcas', 'Cada marca es su universo: calendario, métricas, estrategia y archivos'],
  mistareas: ['✅ Mis tareas', 'Tu día: tareas asignadas, por cliente y por estado'],
  equipo: ['👥 Equipo', 'Administra personas, asigna tareas y revisa la ejecución'],
  altas: ['📋 Formularios', 'Crea el typeform, comparte el link y revisa las respuestas de marcas nuevas'],
  radar: ['🎯 Estrategia · Radar', 'Análisis de tendencias en vivo por país y categoría'],
  ideas: ['🎯 Estrategia · Ideas y guiones', 'Ideas y estructura de creativos según lo que está en tendencia'],
  tendencias: ['🎯 Estrategia · Biblioteca', 'Estructuras ganadoras de referencia'],
  produccion: ['🎬 Producción', 'Qué grabar por marca — el material que alimenta a Creativa'],
  edicion: ['✂️ Creativa', 'Editar y diseñar: cola por prioridad'],
  community: ['📣 Community', 'Calendario: qué publicar y cuándo, retrasos e historias'],
  captions: ['📣 Community · Captions', 'Copys estratégicos por plataforma'],
  hashtags: ['📣 Community · Hashtags', 'Mezcla estratégica de hashtags'],
  pauta: ['📈 Pauta', 'Gasto por semana por marca, conectado al Portal de clientes']
};
$$('.nav__item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    $$('.nav__item').forEach(b => b.classList.toggle('active', b === btn));
    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#view-' + view).classList.remove('hidden');
    $('#viewTitle').textContent = VIEW_META[view][0];
    $('#viewSub').textContent = VIEW_META[view][1];
    if (view === 'inicio') loadInicio();
    if (view === 'calendario') loadCalendario();
    if (view === 'pauta') loadPauta();
    if (view === 'gestion' && !state.gestionLoaded) loadGestion();
    if (view === 'metricas' && !state.metricasLoaded) loadMetricas();
    if (view === 'archivos') loadArchivos();
    if (view === 'mistareas') loadMisTareas();
    if (view === 'equipo') loadEquipo();
    if (view === 'altas') loadAltas();
    if (view === 'produccion') loadProduccion();
    if (view === 'edicion') loadEdicion();
    if (view === 'community') loadCommunity();
    closeNav();
  });
});

/* ---------------- Menú móvil (drawer) ---------------- */
function closeNav() { document.getElementById('app')?.classList.remove('nav-open'); }
function toggleNav() { document.getElementById('app')?.classList.toggle('nav-open'); }
$('#hambBtn')?.addEventListener('click', toggleNav);
$('#navBackdrop')?.addEventListener('click', closeNav);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

/* ---------------- Gestión ---------------- */
$$('#gMode .seg__btn').forEach(b => b.addEventListener('click', () => {
  const m = b.dataset.gmode;
  $$('#gMode .seg__btn').forEach(x => x.classList.toggle('active', x === b));
  $('#gMarcas').classList.toggle('hidden', m !== 'marcas');
  $('#gFlujo').classList.toggle('hidden', m !== 'flujo');
  if (m === 'flujo') renderFlujo();
}));

async function loadGestion() {
  $('#gMarcas').innerHTML = '<div class="loading"><div class="spinner"></div>Armando tu tablero de trabajo…</div>';
  const [g, cal, mt] = await Promise.all([
    api('/api/gestion'), api('/api/gestion/calendario'), api('/api/team/mytasks')
  ]);
  const data = g.data;
  state.gestion = data;
  state.gestionCal = (cal.data && cal.data.items) || [];
  state.gestionTasks = (mt.data && mt.data.tasks) || [];
  state.gestionLoaded = true;
  renderGestionStats(data);
  renderMarcas(data);
}

function renderGestionStats(d) {
  const r = d.resumen || {};
  $('#gStats').innerHTML = `
    <div class="g-stat"><b>${d.marcasDetectadas || 0}</b><span>marcas</span></div>
    <div class="g-stat g-stat--red"><b>${r.retrasadas || 0}</b><span>retrasadas</span></div>
    <div class="g-stat"><b>${r.enProceso || 0}</b><span>en proceso</span></div>
    <div class="g-stat"><b>${r.alDia || 0}</b><span>al día</span></div>
    <div class="g-stat-note">Ciclo <b>${esc((d.ciclo || {}).label || 'Sin ciclo')}</b>${(d.ciclo || {}).dia ? ` · día ${(d.ciclo).dia}/${(d.ciclo).dias || ''}` : ''}</div>`;
}

const TIPO_ICON = { Reel: '🎬', Post: '🖼️', Carrusel: '🎠', Historia: '⚡', Creativos: '🎬', Historias: '⚡' };

const ESTADO_INFO = {
  retrasado:  { label: 'Retrasado', cls: 'st-red' },
  en_proceso: { label: 'En proceso', cls: 'st-blue' },
  al_dia:     { label: 'Al día',    cls: 'st-green' }
};

function normStr(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

function renderAlertas(d) {
  const cont = $('#gAlertas');
  if (!cont) return;
  const alertas = [];
  (d.marcas || []).forEach(m => {
    const c = m.compromiso, faltan = [];
    if (c.creativos.faltanProgramar) faltan.push(`${c.creativos.faltanProgramar} creativo${c.creativos.faltanProgramar > 1 ? 's' : ''}`);
    if (c.historias.faltanProgramar) faltan.push(`${c.historias.faltanProgramar} historia${c.historias.faltanProgramar > 1 ? 's' : ''}`);
    if (c.estado === 'retrasado') alertas.push({ nivel: 'alta', marca: m.marca, txt: `sin programar. Faltan ${faltan.join(' y ')} para el ciclo.` });
    else if (faltan.length) alertas.push({ nivel: 'media', marca: m.marca, txt: `van ${c.creativos.programados}/${c.creativos.meta} creativos. Faltan ${faltan.join(' y ')}.` });
  });
  if (!alertas.length) { cont.innerHTML = ''; return; }
  const altas = alertas.filter(a => a.nivel === 'alta');
  cont.innerHTML = `<div class="alerta ${altas.length ? 'alerta--alta' : ''}">
      <div class="alerta__ico">⚠</div>
      <div><b>${altas.length ? `Vamos retrasados en ${altas.length} marca${altas.length > 1 ? 's' : ''}` : 'Pendiente por programar este ciclo'}</b>
        <ul class="alerta__list">${alertas.slice(0, 6).map(a => `<li><b>${esc(a.marca)}</b>: ${esc(a.txt)}</li>`).join('')}</ul></div>
    </div>`;
}

function renderMarcas(d) {
  renderAlertas(d);
  const me = state.me || {};
  const cal = state.gestionCal || [];
  const tasks = state.gestionTasks || [];
  // Semana actual (lun–dom)
  const ws = startOfWeek(new Date());
  const hoyISO = new Date().toISOString().slice(0, 10);
  const semana = DIAS_SEM.map((lbl, i) => {
    const dd = new Date(ws); dd.setDate(ws.getDate() + i);
    return { lbl, dia: dd.getDate(), iso: dd.toISOString().slice(0, 10), hoy: dd.toISOString().slice(0, 10) === hoyISO };
  });

  const contexto = `<div class="gw-ctx">
      <div><span class="gw-ctx__k">Tu área</span><b>${esc(me.area || '—')}</b></div>
      <div><span class="gw-ctx__k">Ciclo</span><b>${esc((d.ciclo || {}).label || 'Sin ciclo')}</b>${(d.ciclo || {}).dia ? ` · día ${(d.ciclo).dia}/${(d.ciclo).dias || ''}` : ''}</div>
      <div><span class="gw-ctx__k">Semana</span><b>${semana[0].dia} – ${semana[6].dia}</b></div>
    </div>`;

  const cards = d.marcas.map(m => {
    const c = m.compromiso, st = ESTADO_INFO[c.estado] || ESTADO_INFO.al_dia;
    const nb = normStr(m.marca);
    const misTareas = tasks.filter(t => t.status !== 'hecho' && normStr(t.cliente) && (normStr(t.cliente).includes(nb) || nb.includes(normStr(t.cliente))));
    const dias = semana.map(day => {
      const piezas = cal.filter(it => normStr(it.marca) === nb && it.fecha === day.iso);
      return `<div class="gw-day ${day.hoy ? 'gw-day--hoy' : ''} ${piezas.length ? 'gw-day--has' : ''}">
          <span class="gw-day__l">${day.lbl}</span><span class="gw-day__n">${day.dia}</span>
          ${piezas.length ? `<span class="gw-day__c">${piezas.length}</span>` : ''}
        </div>`;
    }).join('');
    const falta = c.creativos.faltanProgramar;
    return `
    <div class="gw-card">
      <div class="gw-card__head">
        <div><div class="g-card__name">${esc(m.marca)}</div>
          <div class="g-card__sector">${esc(m.sector)} · ${c.creativos.programados}/${c.creativos.meta} en cronograma${falta ? ` · falta ${falta}` : ''}</div></div>
        <span class="g-status ${st.cls}">${st.label}</span>
      </div>
      <div class="gw-week">${dias}</div>
      <div class="gw-tasks">
        <div class="gw-tasks__h">Mis tareas <span>${misTareas.length}</span></div>
        ${misTareas.length ? misTareas.map(t => `
          <div class="gw-task ${t.overdue ? 'gw-task--late' : ''}">
            <span class="gw-task__t">${esc(t.title)}</span>
            <span class="gw-task__d">${t.dueDate ? esc(t.dueDate.slice(5)) : ''}</span>
          </div>`).join('') : '<div class="gw-none">Sin tareas asignadas para este cliente</div>'}
      </div>
      <div class="gw-card__foot">
        <button class="btn btn--ghost btn--sm" data-goto2="calendario">Ver calendario</button>
        <button class="btn btn--ghost btn--sm g-edit" data-marca="${esc(m.marca)}">Metas</button>
      </div>
    </div>`;
  }).join('');

  $('#gMarcas').innerHTML = contexto + '<div class="gw-grid">' + cards + '</div>';
  $$('.g-edit').forEach(b => b.addEventListener('click', () => openMetas(b.dataset.marca)));
  $$('[data-goto2]').forEach(b => b.addEventListener('click', () => document.querySelector(`.nav__item[data-view="${b.dataset.goto2}"]`)?.click()));
}

/* ---------------- Flujo de piezas (tablero por etapa) ---------------- */
const ETAPA_CLS = { idea: '', aprobada: 'st-blue', grabada: 'st-blue', editada: 'st-blue', publicada: 'st-green' };
async function renderFlujo() {
  const cont = $('#gFlujo');
  cont.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando flujo…</div>';
  const { data } = await api('/api/piezas');
  state.piezas = {}; // índice para el modal
  (Object.values(data.columnas || {}).flat()).forEach(p => state.piezas[p.id] = p);
  const head = `<div class="fl-top">
      <span class="topbar__sub">${data.total || 0} piezas en el flujo · arrastra… o abre una para ver guion, características y mover de etapa</span>
      <button class="btn btn--primary btn--sm" id="flNueva">+ Nueva pieza</button>
    </div>`;
  cont.innerHTML = head + '<div class="fl-board">' + data.etapas.map(e => {
    const items = data.columnas[e.slug] || [];
    return `<div class="fl-col">
      <div class="fl-col__head"><span class="fl-col__name">${esc(e.label)}</span><span class="fl-col__n">${items.length}</span></div>
      <div class="fl-col__area">${esc(e.area)}</div>
      <div class="fl-col__body">
        ${items.map(p => `
          <div class="fl-piece" data-id="${p.id}">
            <div class="fl-piece__marca">${esc(p.marca)}</div>
            <div class="fl-piece__idea">${esc(p.idea)}</div>
            <div class="fl-piece__foot"><span class="tag">${esc(p.tipo)}</span>${p.responsable ? `<span class="fl-piece__resp">${esc(p.responsable)}</span>` : ''}</div>
          </div>`).join('') || '<div class="fl-empty">—</div>'}
      </div>
    </div>`;
  }).join('') + '</div>';
  $$('.fl-piece').forEach(el => el.addEventListener('click', () => openPieza(el.dataset.id)));
  $('#flNueva').addEventListener('click', () => openPieza(null));
}

function refreshPiezaView() {
  if (state.marcaActiva) { marcaCalendario(state.marcaActiva.marca); }
  else if (typeof renderFlujo === 'function') { try { renderFlujo(); } catch (_) {} }
}
function openPieza(id) {
  const et = [['idea', 'Idea'], ['aprobada', 'Aprobada'], ['grabada', 'Grabada'], ['editada', 'Editada'], ['publicada', 'Publicada']];
  const p = id ? state.piezas[id] : { id: '', marca: '', idea: '', tipo: 'Reel', guion: '', caracteristicas: '', etapa: 'idea', responsable: '', comentarios: [] };
  const people = (state.equipoPeople || []).map(x => x.name);
  const html = `<div class="g-modal" id="pzModal"><div class="g-modal__box glass pz-box">
      <div class="pz-head">
        <input id="pzMarca" class="pz-marca" placeholder="Marca" value="${esc(p.marca)}">
        <select id="pzEtapa" class="pz-etapa">${et.map(([v, l]) => `<option value="${v}" ${p.etapa === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <input id="pzIdea" class="pz-idea" placeholder="La idea / título" value="${esc(p.idea)}">
      <div class="form-grid" style="margin:.6rem 0">
        <label class="select"><span>Tipo</span><select id="pzTipo">${['Reel', 'Post', 'Carrusel', 'Historia'].map(t => `<option ${p.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="select select--grow"><span>Responsable</span><input id="pzResp" list="pzPeople" value="${esc(p.responsable || '')}" placeholder="Quién lo tiene">
          <datalist id="pzPeople">${people.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      </div>
      <label class="pz-field"><span>Guion</span><textarea id="pzGuion" rows="4" placeholder="El guion del contenido…">${esc(p.guion || '')}</textarea></label>
      <label class="pz-field"><span>Características</span><textarea id="pzCar" rows="2" placeholder="Formato, duración, música, referencias…">${esc(p.caracteristicas || '')}</textarea></label>
      <div class="pz-field pz-pub"><span>📢 Publicación y métricas <em>(aparece en el portal del cliente al llegar a Editada/Publicada)</em></span>
        <div class="pz-links">
          <label class="select"><span>Instagram</span><input id="pzLinkIg" placeholder="Link de Instagram" value="${esc(p.linkIg || p.link || '')}"></label>
          <label class="select"><span>TikTok</span><input id="pzLinkTiktok" placeholder="Link de TikTok" value="${esc(p.linkTiktok || '')}"></label>
          <label class="select"><span>LinkedIn</span><input id="pzLinkLinkedin" placeholder="Link de LinkedIn" value="${esc(p.linkLinkedin || '')}"></label>
        </div>
        <div class="pz-metrics">
          <label class="select"><span>Vistas</span><input id="pzViews" type="number" min="0" value="${esc(p.mViews || '')}"></label>
          <label class="select"><span>Likes</span><input id="pzLikes" type="number" min="0" value="${esc(p.mLikes || '')}"></label>
          <label class="select"><span>Guardados</span><input id="pzSaved" type="number" min="0" value="${esc(p.mSaved || '')}"></label>
          <label class="select"><span>Compartidos</span><input id="pzShared" type="number" min="0" value="${esc(p.mShared || '')}"></label>
        </div>
      </div>
      ${id ? `<div class="pz-field"><span>Comentarios</span>
        <div class="pz-comments">${(p.comentarios || []).map(c => `<div class="pz-comment ${c.sistema ? 'pz-comment--sys' : ''}"><b>${esc(c.autor)}</b> ${esc(c.texto)}</div>`).join('') || '<div class="gw-none">Sin comentarios</div>'}</div>
        <div class="pz-addc"><input id="pzC" placeholder="Escribe un comentario…"><button class="btn btn--ghost btn--sm" id="pzCadd">Comentar</button></div></div>` : ''}
      <div class="g-modal__actions">
        ${id ? '<button class="btn btn--ghost btn--sm" id="pzDel">Eliminar</button>' : ''}
        <button class="btn btn--ghost btn--sm" id="pzCancel">Cerrar</button>
        <button class="btn btn--primary btn--sm" id="pzSave">Guardar</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const close = () => $('#pzModal').remove();
  $('#pzCancel').addEventListener('click', close);
  $('#pzModal').addEventListener('click', e => { if (e.target.id === 'pzModal') close(); });
  $('#pzSave').addEventListener('click', async () => {
    const body = { id, marca: $('#pzMarca').value, idea: $('#pzIdea').value, tipo: $('#pzTipo').value, responsable: $('#pzResp').value, guion: $('#pzGuion').value, caracteristicas: $('#pzCar').value,
      linkIg: $('#pzLinkIg').value, linkTiktok: $('#pzLinkTiktok').value, linkLinkedin: $('#pzLinkLinkedin').value,
      mViews: $('#pzViews').value, mLikes: $('#pzLikes').value, mSaved: $('#pzSaved').value, mShared: $('#pzShared').value };
    if (!id) { const r = await api('/api/piezas/crear', { method: 'POST', body }); if (r.data.ok && $('#pzEtapa').value !== 'idea') await api('/api/piezas/etapa', { method: 'POST', body: { id: r.data.pieza.id, etapa: $('#pzEtapa').value } }); }
    else { await api('/api/piezas/update', { method: 'POST', body }); if ($('#pzEtapa').value !== p.etapa) await api('/api/piezas/etapa', { method: 'POST', body: { id, etapa: $('#pzEtapa').value } }); }
    close(); refreshPiezaView();
  });
  if (id) {
    $('#pzDel').addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta pieza?')) return;
      await api('/api/piezas/remove', { method: 'POST', body: { id } });
      close(); refreshPiezaView();
    });
    $('#pzCadd').addEventListener('click', async () => {
      const t = $('#pzC').value.trim(); if (!t) return;
      const { data } = await api('/api/piezas/comentario', { method: 'POST', body: { id, texto: t } });
      if (data.ok) { state.piezas[id] = data.pieza; close(); openPieza(id); }
    });
  }
}

function openMetas(marca) {
  const m = state.gestion.marcas.find(x => x.marca === marca);
  if (!m) return;
  const html = `
    <div class="g-modal" id="gModal">
      <div class="g-modal__box glass">
        <h3>Metas del ciclo · ${esc(marca)}</h3>
        <p class="topbar__sub">Según tu Plan de Trabajo: 7 creativos + 1 campaña = 8 · mínimo 15 historias.</p>
        <div class="g-modal__grid">
          <label class="select"><span>🎬 Creativos</span><input type="number" min="0" id="meta-creativos" value="${m.metas.creativos || 0}"></label>
          <label class="select"><span>⚡ Historias</span><input type="number" min="0" id="meta-historias" value="${m.metas.historias || 0}"></label>
        </div>
        <div class="g-modal__actions">
          <button class="btn btn--ghost btn--sm" id="gCancel">Cancelar</button>
          <button class="btn btn--primary btn--sm" id="gSave">Guardar metas</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#gCancel').addEventListener('click', () => $('#gModal').remove());
  $('#gModal').addEventListener('click', e => { if (e.target.id === 'gModal') $('#gModal').remove(); });
  $('#gSave').addEventListener('click', async () => {
    const body = { marca, creativos: $('#meta-creativos').value, historias: $('#meta-historias').value };
    await api('/api/gestion/metas', { method: 'POST', body });
    $('#gModal').remove();
    state.gestionLoaded = false;
    loadGestion();
  });
}

/* ---------------- Rol: Edición ---------------- */
async function loadEdicion() {
  const out = $('#edicionOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando cola de edición…</div>';
  const { data } = await api('/api/gestion/edicion');
  if (!data.total) { out.innerHTML = '<div class="empty">No hay piezas en producción ahora mismo. Cuando una pieza pase a "Grabada", aparece aquí para editar.</div>'; return; }
  out.innerHTML = '<div class="g-flow">' + data.orden.map(col => {
    const items = data.columnas[col] || [];
    return `<div class="g-col">
      <div class="g-col__head"><div class="g-col__area">${esc(col)}</div><div class="g-col__dias">${items.length}</div></div>
      ${items.length ? items.map(it => `
        <div class="ed-item">
          <div class="ed-item__top"><b>${esc(it.marca)}</b><span class="tag tag--red">${esc(it.tipo)}</span></div>
          ${it.publicaEl ? `<div class="ed-item__date">📅 publica ${esc(it.publicaEl)}</div>` : ''}
          <details><summary>Checklist de edición</summary><ul class="ed-check">${it.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul></details>
        </div>`).join('') : '<div class="ed-empty">Vacío</div>'}
    </div>`;
  }).join('') + '</div>';
}

/* ---------------- Rol: Community ---------------- */
async function loadCommunity() {
  const out = $('#communityOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando calendario…</div>';
  const { data } = await api('/api/gestion/community');
  const marcasR = (state.hubMarcas && state.hubMarcas.length) ? { marcas: state.hubMarcas } : ((await api('/api/marca/lista')).data || { marcas: [] });
  const cwMarcas = marcasR.marcas || [];
  let html = `<div class="glass panel form-panel">
      <h3 class="live-h3" style="margin-top:0">📈 Seguidores y visualizaciones por semana</h3>
      <p class="hub-hint" style="margin:.1rem 0 .8rem">Community registra el crecimiento de cada marca — alimenta las métricas del cliente.</p>
      <div class="form-grid">
        <label class="select"><span>Marca</span><select id="cwMarca">${cwMarcas.map(m => `<option value="${esc(m.marca)}">${esc(m.marca)}</option>`).join('')}</select></label>
        <label class="select"><span>Semana</span><input id="cwWeek" type="week"></label>
        <label class="select"><span>Seguidores</span><input id="cwFollowers" type="number" min="0" placeholder="ej: 12500"></label>
        <label class="select"><span>Visualizaciones (semana)</span><input id="cwViews" type="number" min="0" placeholder="ej: 84000"></label>
      </div>
      <button class="btn btn--primary" id="cwSave">Guardar semana</button>
      <div id="cwList" style="margin-top:1rem"></div>
    </div>`;
  if ((data.retrasos || []).length) {
    html += `<div class="result-card" style="margin-bottom:1rem;border-color:rgba(249,0,0,.3)">
      <h3>⏰ Retrasos (${data.retrasos.length}) — publicar ya</h3>
      <div class="reddit-list">${data.retrasos.map(r => `
        <div class="reddit-item"><span class="reddit-t"><b>${esc(r.marca)}</b> · ${esc(r.tipo)}</span><span class="reddit-sub">${esc(r.fecha || r.estado)}</span></div>`).join('')}</div></div>`;
  }
  html += `<h3 class="live-h3">📅 Agenda de publicación</h3>`;
  if ((data.agenda || []).length) {
    html += '<div class="reddit-list">' + data.agenda.map(a => `
      <div class="reddit-item">
        <span class="reddit-up">${esc(a.fecha || '')}</span>
        <span class="reddit-t"><b>${esc(a.marca)}</b> · ${esc(a.tipo)}</span>
        <span class="tag ${a.estado === 'Publicada' ? '' : 'tag--red'}">${esc(a.estado)}</span>
      </div>`).join('') + '</div>';
  } else html += '<div class="empty">Sin fechas de publicación cargadas todavía.</div>';

  html += `<h3 class="live-h3">⚡ Historias por marca (meta ${'≥'}15/ciclo)</h3><div class="g-grid">`;
  html += (data.historias || []).map(h => `
    <div class="g-card">
      <div class="g-card__top"><div class="g-card__name">${esc(h.marca)}</div>
        <div class="g-ciclo"><div class="g-ciclo__pct">${h.hechas || 0}/${h.meta || 0}</div><span>publicadas</span></div></div>
      <div class="g-chips"><span class="g-chip">🧠 ${h.enBanco || 0} en banco</span></div>
    </div>`).join('') + '</div>';
  out.innerHTML = html;
  // Semanal (seguidores/views) por marca
  const cwLoad = async () => {
    const marca = $('#cwMarca') && $('#cwMarca').value; if (!marca) { $('#cwList').innerHTML = ''; return; }
    const r = await api('/api/marca/semanas?marca=' + encodeURIComponent(marca));
    const sem = (r.ok && r.data.semanas) || [];
    $('#cwList').innerHTML = sem.length ? `<div class="eq-list">${sem.map(s => `
      <div class="eq-row"><div class="eq-row__id"><div class="eq-person__name">${esc(s.semana)}</div></div>
        <div class="eq-person__tags"><span class="tag">👥 ${(+s.seguidores || 0).toLocaleString('es-CO')} seguidores</span><span class="tag">👁 ${(+s.views || 0).toLocaleString('es-CO')} views</span></div></div>`).join('')}</div>`
      : '<div class="empty">Aún no hay semanas registradas para esta marca.</div>';
  };
  if ($('#cwMarca')) { $('#cwMarca').addEventListener('change', cwLoad); cwLoad(); }
  if ($('#cwSave')) $('#cwSave').addEventListener('click', async () => {
    const body = { marca: $('#cwMarca').value, semana: $('#cwWeek').value, seguidores: $('#cwFollowers').value, views: $('#cwViews').value };
    if (!body.semana) { alert('Elige la semana.'); return; }
    const btn = $('#cwSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    const r = await api('/api/marca/semana', { method: 'POST', body });
    btn.disabled = false; btn.textContent = 'Guardar semana';
    if (r.ok) { $('#cwFollowers').value = ''; $('#cwViews').value = ''; cwLoad(); } else alert(r.data.error || 'No se pudo');
  });
}

/* ---------------- Mis tareas ---------------- */
const TASK_STATE = { pendiente: 'Pendiente', en_curso: 'En curso', hecho: 'Hecho' };
const PRIO_CLS = { alta: 'st-red', media: 'st-blue', baja: '' };
async function loadMisTareas() {
  const out = $('#mistareasOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando tus tareas…</div>';
  const { data } = await api('/api/team/mytasks');
  const tasks = data.tasks || [];
  const cols = { pendiente: [], en_curso: [], hecho: [] };
  tasks.forEach(t => cols[t.status] && cols[t.status].push(t));
  const atras = tasks.filter(t => t.overdue).length;
  let html = `<div class="g-stats">
      <div class="g-stat"><b>${tasks.length}</b><span>tareas</span></div>
      <div class="g-stat"><b>${cols.pendiente.length}</b><span>pendientes</span></div>
      <div class="g-stat g-stat--red"><b>${atras}</b><span>atrasadas</span></div>
      <div class="g-stat-note">${esc(data.me.name)} · ${esc(data.me.area || '')}</div>
    </div>`;
  if (!tasks.length) { out.innerHTML = html + '<div class="empty">No tienes tareas asignadas todavía.</div>'; return; }
  html += '<div class="g-flow">' + ['pendiente', 'en_curso', 'hecho'].map(st => `
    <div class="g-col">
      <div class="g-col__head"><div class="g-col__area">${TASK_STATE[st]}</div><div class="g-col__dias">${cols[st].length}</div></div>
      ${cols[st].map(t => taskCard(t, true)).join('') || '<div class="ed-empty">—</div>'}
    </div>`).join('') + '</div>';
  out.innerHTML = html;
  bindTaskActions();
}
function taskCard(t, withActions) {
  return `<div class="ed-item ${t.overdue ? 'ed-item--late' : ''}">
    <div class="ed-item__top"><b>${esc(t.title)}</b><span class="g-status ${PRIO_CLS[t.priority] || ''}">${esc(t.priority)}</span></div>
    <div class="ed-item__date">${t.cliente ? '🏷 ' + esc(t.cliente) + ' · ' : ''}${esc(t.area)}${t.dueDate ? ' · 📅 ' + esc(t.dueDate) : ''}${t.overdue ? ' · ⏰ atrasada' : ''}</div>
    ${t.desc ? `<div class="ed-item__date">${esc(t.desc)}</div>` : ''}
    ${withActions ? `<div class="arch-folder__actions" style="margin-top:.5rem">
      ${t.status !== 'en_curso' ? `<button class="btn btn--ghost btn--sm t-st" data-id="${t.id}" data-st="en_curso">▶ En curso</button>` : ''}
      ${t.status !== 'hecho' ? `<button class="btn btn--ghost btn--sm t-st" data-id="${t.id}" data-st="hecho">✓ Hecho</button>` : ''}
      ${t.status !== 'pendiente' ? `<button class="btn btn--ghost btn--sm t-st" data-id="${t.id}" data-st="pendiente">↺</button>` : ''}
    </div>` : ''}
  </div>`;
}
function bindTaskActions(reload) {
  $$('.t-st').forEach(b => b.addEventListener('click', async () => {
    await api('/api/team/task-status', { method: 'POST', body: { id: b.dataset.id, status: b.dataset.st } });
    (reload || loadMisTareas)();
  }));
}

/* ---------------- Equipo (admin) ---------------- */
/* ---------------- Formularios (typeforms) ---------------- */
const DEFAULT_ONB = {
  id: 'onboarding', name: 'Alta de marca', title: 'Cuéntanos de tu marca', subtitle: '', banner: '', accent: '#F90000',
  questions: [
    { id: 'marca', label: '¿Cuál es tu marca?', hint: 'El nombre con el que te conocen.', type: 'text', required: true, name: true },
    { id: 'hacen', label: '¿Qué hacen?', hint: 'En pocas líneas, a qué se dedica tu marca.', type: 'area', required: true },
    { id: 'clientes', label: '¿Cuáles son tus clientes?', hint: 'A quién le vendes o le hablas.', type: 'area' },
    { id: 'tresPalabras', label: 'Describe en 3 palabras tu marca.', hint: 'Las 3 que mejor la definen.', type: 'text' },
    { id: 'inspiran', label: '¿Qué marcas te inspiran y por qué?', hint: 'Referentes que admiras.', type: 'area' },
    { id: 'redes', label: 'Copia tus redes sociales.', hint: 'Instagram, TikTok, web… pega los links.', type: 'area' },
    { id: 'esperan', label: '¿Qué esperas de Versus como tu equipo?', hint: 'Qué te gustaría lograr con nosotros.', type: 'area' },
    { id: 'manual', label: '¿Tienes manual de marca?', hint: 'Si sí, pega el link o súbelo.', type: 'manual' }
  ]
};
const TIPOS = { text: 'Texto corto', area: 'Texto largo', choice: 'Opciones', manual: 'Sí/No + adjunto' };
function isAdmin() { return state.me && state.me.role === 'admin'; }
function formBase() { return location.origin + '/alta-marca.html'; }

async function loadAltas() {
  const out = $('#altasOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando…</div>';
  const [fr, ar] = await Promise.all([api('/api/formConfig'), api('/api/onboarding')]);
  state.forms = (fr.ok && fr.data.forms) ? fr.data.forms.slice() : [];
  if (!state.forms.some(f => f.id === 'onboarding')) state.forms.unshift(Object.assign({ _virtual: true }, DEFAULT_ONB));
  state.altas = (ar.ok && ar.data.altas) ? ar.data.altas : [];
  state.formTab = state.formTab || 'respuestas';
  state.formEdit = null;
  renderFormsView();
}
function renderFormsView() {
  const out = $('#altasOut');
  out.innerHTML = `<div class="seg formseg">
    <button class="seg__btn ${state.formTab === 'respuestas' ? 'active' : ''}" data-ftab="respuestas">Respuestas</button>
    <button class="seg__btn ${state.formTab === 'formularios' ? 'active' : ''}" data-ftab="formularios">Formularios</button>
  </div><div id="formBody"></div>`;
  $$('.formseg .seg__btn').forEach(b => b.onclick = () => { state.formTab = b.dataset.ftab; state.formEdit = null; renderFormsView(); });
  if (state.formTab === 'respuestas') renderRespuestas();
  else if (state.formEdit) renderFormEditor();
  else renderFormsList();
}
function renderRespuestas() {
  const body = $('#formBody');
  const altas = state.altas || [];
  if (!altas.length) { body.innerHTML = `<div class="empty">Aún no hay respuestas.<br><small>Comparte un formulario desde la pestaña <b>Formularios</b>.</small></div>`; return; }
  body.innerHTML = altas.map(a => {
    const items = (a.items || []).filter(it => it.value).map(it => `<div class="alta-row"><span class="alta-lbl">${esc(it.label)}</span><span class="alta-val">${esc(it.value)}</span></div>`).join('');
    let manual = '';
    if (a.manual) {
      let v = a.manual.tiene === 'si' ? 'Sí' : 'No aún';
      if (a.manual.link) v += ` · <a href="${esc(a.manual.link)}" target="_blank" rel="noopener">ver link</a>`;
      if (a.manual.data) v += ` · <a href="${a.manual.data}" download="${esc(a.manual.nombre || 'manual')}">descargar ${esc(a.manual.nombre || 'archivo')}</a>`;
      manual = `<div class="alta-row"><span class="alta-lbl">Manual de marca</span><span class="alta-val">${v}</span></div>`;
    }
    return `<div class="glass alta-card">
      <div class="alta-head"><h3>${esc(a.marca || 'Sin nombre')}</h3>
        <div class="alta-meta">${a.formName ? `<span class="alta-tag">${esc(a.formName)}</span>` : ''}<span class="alta-when">${a.at ? new Date(a.at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span><button class="alta-del" data-del="${esc(a.id)}" title="Eliminar">✕</button></div>
      </div>${items}${manual}
    </div>`;
  }).join('');
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar esta respuesta? No se puede deshacer.')) return;
    b.disabled = true;
    const r = await api('/api/onboarding/remove', { method: 'POST', body: { id: b.dataset.del } });
    if (r.ok) { state.altas = state.altas.filter(x => x.id !== b.dataset.del); renderRespuestas(); }
    else { alert(r.data.error || 'No se pudo eliminar'); b.disabled = false; }
  });
}
function renderFormsList() {
  const body = $('#formBody');
  const forms = state.forms || [];
  let html = `<div class="alta-hint">${isAdmin() ? 'Crea o edita el typeform, comparte el link y las respuestas llegan a la pestaña «Respuestas».' : 'Estos son los formularios activos. Solo el admin los edita.'}</div>`;
  if (isAdmin()) html += `<button class="btn btn--primary" id="newForm" style="margin-bottom:14px">+ Nuevo formulario</button>`;
  html += forms.map(f => {
    const url = formBase() + '?f=' + encodeURIComponent(f.id);
    return `<div class="glass alta-card">
      <div class="alta-head"><h3>${esc(f.name || f.id)}${f._virtual ? ' <span class="alta-tag">predeterminado</span>' : ''}</h3><span class="alta-when">${(f.questions || []).length} preguntas</span></div>
      <div class="alta-row"><span class="alta-lbl">Link para compartir</span><span class="alta-val"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a> · <button class="mini" data-copy="${esc(url)}">copiar</button></span></div>
      <div class="form-actions">
        <button class="btn btn--ghost btn--sm" data-preview="${esc(f.id)}">Ver preguntas</button>
        ${isAdmin() ? `<button class="btn btn--ghost btn--sm" data-edit="${esc(f.id)}">Editar</button>${f._virtual ? '' : `<button class="btn btn--ghost btn--sm" data-delform="${esc(f.id)}">Eliminar</button>`}` : ''}
      </div>
      <div class="form-preview hidden" id="prev-${esc(f.id)}"></div>
    </div>`;
  }).join('');
  body.innerHTML = html;
  const nf = document.getElementById('newForm'); if (nf) nf.onclick = () => { state.formEdit = { id: '', name: '', title: '', subtitle: '', banner: '', accent: '#F90000', questions: [{ id: 'q1', label: '', hint: '', type: 'text', required: true, name: true }] }; renderFormsView(); };
  body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); b.textContent = '¡copiado!'; setTimeout(() => b.textContent = 'copiar', 1400); });
  body.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => {
    const f = forms.find(x => x.id === b.dataset.preview); const el = document.getElementById('prev-' + b.dataset.preview);
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    el.innerHTML = (f.questions || []).map((q, n) => `<div class="pv-q"><span class="pv-n">${n + 1}</span><div><b>${esc(q.label || '(sin texto)')}</b>${q.hint ? `<div class="pv-h">${esc(q.hint)}</div>` : ''}<span class="pv-t">${TIPOS[q.type] || q.type}${q.required ? ' · obligatoria' : ''}</span></div></div>`).join('');
    el.classList.remove('hidden');
  });
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const f = forms.find(x => x.id === b.dataset.edit); state.formEdit = JSON.parse(JSON.stringify(f)); delete state.formEdit._virtual; renderFormsView(); });
  body.querySelectorAll('[data-delform]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar este formulario? Las respuestas ya recibidas se conservan.')) return;
    const r = await api('/api/formConfig/remove', { method: 'POST', body: { id: b.dataset.delform } });
    if (r.ok) loadAltas(); else alert(r.data.error || 'No se pudo');
  });
}
function syncEditorFromDOM() {
  const fe = state.formEdit; if (!fe) return;
  fe.name = $('#feName')?.value || ''; fe.title = $('#feTitle')?.value || ''; fe.subtitle = $('#feSub')?.value || '';
  fe.accent = $('#feAccent')?.value || '#F90000'; const bl = $('#feBannerUrl'); if (bl && bl.value.trim()) fe.banner = bl.value.trim();
  $$('.fe-q').forEach((el, n) => {
    const q = fe.questions[n]; if (!q) return;
    q.label = el.querySelector('.feq-label').value; q.hint = el.querySelector('.feq-hint').value;
    q.type = el.querySelector('.feq-type').value; q.required = el.querySelector('.feq-req').checked;
    const opt = el.querySelector('.feq-opts'); if (opt) q.options = opt.value.split('\n').map(s => s.trim()).filter(Boolean);
  });
}
function renderFormEditor() {
  const body = $('#formBody'); const fe = state.formEdit;
  const q = fe.questions.map((qq, n) => `<div class="fe-q" data-n="${n}">
    <div class="fe-q-top"><span class="fe-q-n">Pregunta ${n + 1}</span>
      <div class="fe-q-move"><button class="mini" data-up="${n}" ${n === 0 ? 'disabled' : ''}>↑</button><button class="mini" data-down="${n}" ${n === fe.questions.length - 1 ? 'disabled' : ''}>↓</button><button class="mini mini--del" data-rmq="${n}">✕</button></div>
    </div>
    <input class="fe-in feq-label" placeholder="Texto de la pregunta" value="${esc(qq.label || '')}">
    <input class="fe-in feq-hint" placeholder="Ayuda / aclaración (opcional)" value="${esc(qq.hint || '')}">
    <div class="fe-q-row">
      <select class="fe-in feq-type">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${qq.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="fe-chk"><input type="checkbox" class="feq-req" ${qq.required ? 'checked' : ''}> Obligatoria</label>
      <label class="fe-chk"><input type="radio" name="feName" class="feq-name" ${qq.name ? 'checked' : ''}> Es el nombre de la marca</label>
    </div>
    ${qq.type === 'choice' ? `<textarea class="fe-in feq-opts" placeholder="Una opción por línea">${esc((qq.options || []).join('\n'))}</textarea>` : ''}
  </div>`).join('');
  body.innerHTML = `<div class="glass fe-card">
    <div class="fe-head"><h3>${fe.id ? 'Editar formulario' : 'Nuevo formulario'}</h3></div>
    <label class="fe-lbl">Nombre interno</label><input class="fe-in" id="feName" placeholder="Ej: Alta de marca" value="${esc(fe.name || '')}">
    <label class="fe-lbl">Título (lo ve la marca)</label><input class="fe-in" id="feTitle" placeholder="Ej: Cuéntanos de tu marca" value="${esc(fe.title || '')}">
    <label class="fe-lbl">Subtítulo (opcional)</label><input class="fe-in" id="feSub" placeholder="Una línea de contexto" value="${esc(fe.subtitle || '')}">
    <div class="fe-q-row">
      <div style="flex:1"><label class="fe-lbl">Color de acento</label><input class="fe-in" id="feAccent" type="color" value="${esc(fe.accent || '#F90000')}" style="height:44px;padding:4px"></div>
      <div style="flex:2"><label class="fe-lbl">Banner / imagen</label><div class="fe-banner-row"><label class="filebtn">📎 Subir imagen<input type="file" id="feBannerFile" accept="image/*" hidden></label><input class="fe-in" id="feBannerUrl" placeholder="…o pega un link de imagen" value="${esc((fe.banner || '').startsWith('data:') ? '' : (fe.banner || ''))}" style="flex:1"></div><div id="feBannerPrev">${fe.banner ? `<img src="${fe.banner}" class="fe-banner-img">` : ''}</div></div>
    </div>
    <label class="fe-lbl" style="margin-top:16px">Preguntas</label>
    <div id="feQs">${q}</div>
    <button class="btn btn--ghost btn--sm" id="addQ" style="margin-top:8px">+ Agregar pregunta</button>
    <div class="fe-actions"><button class="btn btn--ghost" id="feCancel">Cancelar</button><button class="btn btn--primary" id="feSave">Guardar</button></div>
  </div>`;
  // marca-name radios
  body.querySelectorAll('.feq-name').forEach((r, n) => r.onchange = () => { fe.questions.forEach((qq, m) => qq.name = (m === n)); });
  $('#addQ').onclick = () => { syncEditorFromDOM(); fe.questions.push({ id: 'q' + (fe.questions.length + 1), label: '', hint: '', type: 'text', required: false }); renderFormEditor(); };
  body.querySelectorAll('[data-rmq]').forEach(b => b.onclick = () => { syncEditorFromDOM(); fe.questions.splice(+b.dataset.rmq, 1); if (!fe.questions.length) fe.questions.push({ id: 'q1', label: '', hint: '', type: 'text', required: true, name: true }); renderFormEditor(); });
  body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { syncEditorFromDOM(); const n = +b.dataset.up; [fe.questions[n - 1], fe.questions[n]] = [fe.questions[n], fe.questions[n - 1]]; renderFormEditor(); });
  body.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { syncEditorFromDOM(); const n = +b.dataset.down; [fe.questions[n + 1], fe.questions[n]] = [fe.questions[n], fe.questions[n + 1]]; renderFormEditor(); });
  body.querySelectorAll('.feq-type').forEach((s, n) => s.onchange = () => { syncEditorFromDOM(); renderFormEditor(); });
  const bf = $('#feBannerFile'); bf.onchange = () => { const file = bf.files[0]; if (!file) return; if (file.size > 500 * 1024) { alert('Imagen muy pesada (máx 500KB). Mejor usa un link.'); bf.value = ''; return; } const rd = new FileReader(); rd.onload = () => { fe.banner = rd.result; $('#feBannerUrl').value = ''; $('#feBannerPrev').innerHTML = `<img src="${fe.banner}" class="fe-banner-img">`; }; rd.readAsDataURL(file); };
  $('#feBannerUrl').onchange = () => { const v = $('#feBannerUrl').value.trim(); if (v) { fe.banner = v; $('#feBannerPrev').innerHTML = `<img src="${fe.banner}" class="fe-banner-img">`; } };
  $('#feCancel').onclick = () => { state.formEdit = null; renderFormsView(); };
  $('#feSave').onclick = async () => {
    syncEditorFromDOM();
    if (!fe.name.trim()) { alert('Ponle un nombre al formulario.'); return; }
    if (!fe.questions.some(q => q.label.trim())) { alert('Agrega al menos una pregunta con texto.'); return; }
    if (!fe.questions.some(q => q.name)) fe.questions[0].name = true;
    const btn = $('#feSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    const r = await api('/api/formConfig/save', { method: 'POST', body: { form: fe } });
    if (r.ok) { state.formEdit = null; loadAltas(); } else { alert(r.data.error || 'No se pudo guardar'); btn.disabled = false; btn.textContent = 'Guardar'; }
  };
}

async function loadEquipo() {
  const out = $('#equipoOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando equipo…</div>';
  const [rep, ppl] = await Promise.all([api('/api/team/admin/report'), api('/api/team/admin/people')]);
  if (!rep.ok) { out.innerHTML = `<div class="empty">${esc(rep.data.error || 'Sin acceso')}</div>`; return; }
  const d = rep.data, people = ppl.data.people || [], areas = ppl.data.areas || [];
  state.equipoAreas = areas; state.equipoPeople = people;
  let html = `<div class="g-stats">
      <div class="g-stat"><b>${(d.resumen || {}).personas || 0}</b><span>personas</span></div>
      <div class="g-stat"><b>${(d.resumen || {}).tareas || 0}</b><span>tareas</span></div>
      <div class="g-stat g-stat--red"><b>${(d.resumen || {}).atrasadas || 0}</b><span>atrasadas</span></div>
      <div class="g-stat"><b>${(d.resumen || {}).hechas || 0}</b><span>hechas</span></div>
    </div>
    <div class="seg" id="eqMode">
      <button class="seg__btn active" data-eq="personas">Personas</button>
      <button class="seg__btn" data-eq="tareas">Tareas</button>
      <button class="seg__btn" data-eq="ejecucion">Ejecución</button>
    </div>
    <div id="eqPersonas"></div><div id="eqTareas" class="hidden"></div><div id="eqEjec" class="hidden"></div>`;
  out.innerHTML = html;

  // Personas
  $('#eqPersonas').innerHTML = `
    <div class="glass panel form-panel">
      <div class="form-grid">
        <label class="select"><span>Nombre</span><input id="npName" placeholder="Verónica"></label>
        <label class="select"><span>Usuario</span><input id="npUser" placeholder="veronica"></label>
        <label class="select"><span>Contraseña</span><input id="npPass" placeholder="(deja vacío para no cambiar)"></label>
        <label class="select"><span>Rol</span><select id="npRole"><option value="miembro">Miembro</option><option value="admin">Admin</option></select></label>
      </div>
      <div class="np-areas"><span class="np-areas__lbl">Áreas (elige una o varias)</span>
        <div class="np-areas__grid">${areas.map(a => `<label class="np-chk"><input type="checkbox" class="npAreaChk" value="${esc(a)}"> ${esc(a)}</label>`).join('')}</div>
      </div>
      <button class="btn btn--primary" id="npSave">Guardar persona</button>
    </div>
    <div class="eq-list">${people.map(p => `
      <div class="eq-person">
        <div class="eq-av">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</div>
        <div class="eq-person__id"><div class="eq-person__name">${esc(p.name)}</div><div class="eq-person__user">@${esc(p.username)}</div></div>
        <div class="eq-person__tags">${((p.areas && p.areas.length) ? p.areas : [p.area]).filter(Boolean).map(a => `<span class="tag">${esc(a)}</span>`).join('')}<span class="tag ${p.role === 'admin' ? 'tag--red' : ''}">${esc(p.role)}</span></div>
        ${p.username !== 'versus_admin' ? `<button class="eq-del p-del" data-id="${p.id}" title="Quitar">✕</button>` : ''}
      </div>`).join('')}</div>`;
  $('#npSave').addEventListener('click', async () => {
    const chk = $$('.npAreaChk').filter(c => c.checked).map(c => c.value);
    const body = { name: $('#npName').value, username: $('#npUser').value, password: $('#npPass').value, areas: chk, area: chk[0] || '', role: $('#npRole').value };
    const { data } = await api('/api/team/admin/person', { method: 'POST', body });
    if (data.ok) loadEquipo(); else alert(data.error || 'Error');
  });
  $$('.p-del').forEach(b => b.addEventListener('click', async () => { if (confirm('¿Quitar persona?')) { await api('/api/team/admin/person-remove', { method: 'POST', body: { id: b.dataset.id } }); loadEquipo(); } }));

  // Tareas (crear + lista)
  $('#eqTareas').innerHTML = `
    <div class="glass panel form-panel">
      <div class="form-grid">
        <label class="select select--grow"><span>Tarea</span><input id="ntTitle" placeholder="Guionizar 8 creativos de Persé"></label>
        <label class="select"><span>Asignar a</span><select id="ntWho">${people.map(p => `<option value="${esc(p.username)}">${esc(p.name)}</option>`).join('')}</select></label>
        <label class="select"><span>Área</span><select id="ntArea">${areas.map(a => `<option>${esc(a)}</option>`).join('')}</select></label>
        <label class="select"><span>Cliente</span><input id="ntCli" placeholder="Persé"></label>
        <label class="select"><span>Fecha</span><input id="ntDue" type="date"></label>
        <label class="select"><span>Prioridad</span><select id="ntPrio"><option value="media">Media</option><option value="alta">Alta</option><option value="baja">Baja</option></select></label>
      </div>
      <button class="btn btn--primary" id="ntSave">Crear y asignar</button>
    </div>
    <div class="stack">${d.tasks.map(t => `<div class="result-card">${taskCard(t, false)}<div class="ed-item__date">${esc((people.find(p => p.username === t.assignedTo) || {}).name || t.assignedTo)} · <span class="tag">${TASK_STATE[t.status]}</span> <button class="btn btn--ghost btn--sm t-del" data-id="${t.id}">✕</button></div></div>`).join('') || '<div class="empty">Sin tareas aún.</div>'}</div>`;
  $('#ntSave').addEventListener('click', async () => {
    const body = { title: $('#ntTitle').value, assignedTo: $('#ntWho').value, area: $('#ntArea').value, cliente: $('#ntCli').value, dueDate: $('#ntDue').value, priority: $('#ntPrio').value };
    const { data } = await api('/api/team/admin/task', { method: 'POST', body });
    if (data.ok) loadEquipo(); else alert(data.error || 'Error');
  });
  $$('.t-del').forEach(b => b.addEventListener('click', async () => { await api('/api/team/admin/task-remove', { method: 'POST', body: { id: b.dataset.id } }); loadEquipo(); }));

  // Ejecución (informe por persona y área)
  $('#eqEjec').innerHTML = `
    <h3 class="live-h3">Por persona</h3>
    <div class="eq-list">${d.porPersona.map(p => `
      <div class="eq-row"><div class="eq-row__id"><div class="eq-av eq-av--sm">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</div><div><div class="eq-person__name">${esc(p.name)}</div><div class="eq-person__user">${esc(p.area)}</div></div></div>
        <div class="eq-person__tags"><span class="tag">${p.hechas || 0}/${p.total || 0} hechas</span>${p.atrasadas ? `<span class="tag tag--red">${p.atrasadas} atrasadas</span>` : ''}</div></div>`).join('')}</div>
    <h3 class="live-h3">Por área</h3>
    <div class="eq-list">${d.porArea.map(a => `
      <div class="eq-row"><div class="eq-row__id"><div class="eq-person__name">${esc(a.area)}</div></div>
        <div class="eq-person__tags"><span class="tag">${a.personas || 0} personas</span><span class="tag">${a.tareas || 0} tareas</span>${a.atrasadas ? `<span class="tag tag--red">${a.atrasadas} atrasadas</span>` : ''}</div></div>`).join('')}</div>`;

  $$('#eqMode .seg__btn').forEach(btn => btn.addEventListener('click', () => {
    $$('#eqMode .seg__btn').forEach(x => x.classList.toggle('active', x === btn));
    const m = btn.dataset.eq;
    $('#eqPersonas').classList.toggle('hidden', m !== 'personas');
    $('#eqTareas').classList.toggle('hidden', m !== 'tareas');
    $('#eqEjec').classList.toggle('hidden', m !== 'ejecucion');
  }));
  bindTaskActions();
}

/* ---------------- Marcas: cada marca es su universo ---------------- */
function normKey(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
function fileToBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }

const LOGO_ALIAS = { perse: 'drinkperse', ml: 'mauriciolinares' };
function logoSlugFor(marca) {
  const slugs = state.logoSlugs || []; const k = normKey(marca);
  if (LOGO_ALIAS[k] && slugs.includes(LOGO_ALIAS[k])) return LOGO_ALIAS[k];
  let hit = slugs.find(s => normKey(s) === k);
  if (!hit) hit = slugs.find(s => { const ns = normKey(s); return k.includes(ns) || ns.includes(k); });
  return hit || null;
}
function marcaLogoHTML(marca, cls) {
  const slug = logoSlugFor(marca);
  const src = slug && state.logoData ? state.logoData[slug] : null;
  return src
    ? `<div class="${cls} ${cls}--img"><img src="${src}" alt="${esc(marca)}"></div>`
    : `<div class="${cls}">${esc((marca.trim()[0] || '?').toUpperCase())}</div>`;
}
// Un logo claro (para fondo oscuro) es invisible sobre la caja blanca: le ponemos fondo oscuro.
function fitLogoBg(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 28;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 28, 28);
    const d = ctx.getImageData(0, 0, 28, 28).data;
    let lum = 0, a = 0;
    for (let i = 0; i < d.length; i += 4) { const al = d[i + 3] / 255; if (al < 0.1) continue; lum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * al; a += al; }
    if (a && (lum / a) > 150) { const box = img.parentElement; if (box) box.classList.add('logo--ondark'); }
  } catch (e) {}
}
function bindLogoFit(scope) {
  (scope || document).querySelectorAll('.marca-card__logo--img img, .marca-uni-logo--img img, .bcard-av--img img').forEach(img => {
    if (img.complete && img.naturalWidth) fitLogoBg(img);
    else img.addEventListener('load', () => fitLogoBg(img));
  });
}
async function loadArchivos() {
  state.marcaActiva = null;
  const out = $('#archivosOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando marcas…</div>';
  const [{ data }, lg] = await Promise.all([api('/api/archivos'), api('/api/marca/logos')]);
  state.hubMarcas = data.marcas || [];
  const logosArr = (lg.ok ? lg.data.logos : []) || [];
  state.logoSlugs = logosArr.map(x => x.slug);
  state.logoData = {}; logosArr.forEach(x => { state.logoData[x.slug] = x.dataUri; });
  renderMarcasGrid();
}
function renderMarcasGrid() {
  const out = $('#archivosOut');
  const admin = (state.me || {}).role === 'admin';
  $('#viewTitle').textContent = 'Marcas';
  $('#viewSub').textContent = 'Cada marca es su universo: calendario, métricas, estrategia y archivos';
  const handle = s => '@' + normStr(s).replace(/[^a-z0-9]+/g, '');
  out.innerHTML = `<div class="marca-grid-head"><p class="topbar__sub" style="margin:0 .2rem">Toca una marca para gestionar todo lo suyo: calendario, métricas, estrategia y archivos.</p>${admin ? '<button class="btn btn--primary btn--sm" id="addMarca">+ Agregar marca</button>' : ''}</div>
    <div class="marca-grid">` + state.hubMarcas.map(m => `
      <div class="marca-cell">
        <button class="bcard marca-card" data-marca="${esc(m.marca)}" data-sector="${esc(m.sector || '')}">
          <div class="bcard-head"><div class="bcard-id">
            ${marcaLogoHTML(m.marca, 'bcard-av')}
            <div style="min-width:0"><div class="bcard-name">${esc(m.marca)}</div><div class="bcard-user">${esc(handle(m.marca))}</div></div>
          </div></div>
          <div class="bcard-chips">
            ${m.sector ? `<span class="bchip">${esc(m.sector)}</span>` : ''}
            <span class="bchip bchip--on">Activo</span>
          </div>
          <div class="bcard-foot">Gestionar marca</div>
        </button>
        ${admin ? `<button class="marca-del" data-delmarca="${esc(m.marca)}" title="Eliminar marca">✕</button>` : ''}
      </div>`).join('') + '</div>';
  $$('.marca-card').forEach(c => c.addEventListener('click', (e) => { e.preventDefault(); const el = e.currentTarget; const mk = el.dataset.marca; if (mk) openMarca(mk, el.dataset.sector); }));
  const am = $('#addMarca'); if (am) am.addEventListener('click', addMarcaPrompt);
  $$('[data-delmarca]').forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const marca = b.dataset.delmarca;
    if (!confirm(`¿Quitar «${marca}» de la lista de marcas?\n\nSe oculta del portal (no se borra su historial en la base de datos) y la puedes volver a agregar cuando quieras.`)) return;
    b.disabled = true;
    const r = await api('/api/marca/remove', { method: 'POST', body: { marca } });
    if (r.ok) { state.hubMarcas = state.hubMarcas.filter(x => x.marca !== marca); renderMarcasGrid(); }
    else { alert(r.data.error || 'No se pudo'); b.disabled = false; }
  }));
  bindLogoFit(out);
}
async function addMarcaPrompt() {
  const nombre = prompt('Nombre de la nueva marca:');
  if (!nombre || !nombre.trim()) return;
  const sector = prompt('Sector / rubro (opcional):') || '';
  const r = await api('/api/marca/add', { method: 'POST', body: { marca: nombre.trim(), sector: sector.trim() } });
  if (r.ok) loadArchivos(); else alert(r.data.error || 'No se pudo agregar');
}
function openMarca(marca, sector) {
  state.marcaActiva = { marca, sector };
  const out = $('#archivosOut');
  $('#viewTitle').textContent = marca;
  $('#viewSub').textContent = (sector || '') + ' · su universo completo';
  out.innerHTML = `<button class="marca-back" id="marcaBack">← Todas las marcas</button>
    <div class="marca-uni-head">${marcaLogoHTML(marca, 'marca-uni-logo')}
      <div><div class="marca-uni-name">${esc(marca)}</div><div class="marca-uni-sector">${esc(sector || '')}</div></div>
    </div>
    <div class="hub-tabs">
      <button class="hub-tab active" data-tab="calendario">🗓️ Calendario</button>
      <button class="hub-tab" data-tab="ciclo">🎯 Ciclo</button>
      <button class="hub-tab" data-tab="metricas">📊 Métricas</button>
      <button class="hub-tab" data-tab="estrategia">💡 Estrategia</button>
      <button class="hub-tab" data-tab="archivos">📁 Archivos</button>
    </div>
    <div class="hub-pane" id="marcaPane"></div>`;
  bindLogoFit(out);
  $('#marcaBack').addEventListener('click', () => { state.marcaActiva = null; renderMarcasGrid(); });
  const tabs = out.querySelectorAll('.hub-tab');
  tabs.forEach(t => t.addEventListener('click', () => { tabs.forEach(x => x.classList.toggle('active', x === t)); marcaTab(t.dataset.tab); }));
  marcaTab('calendario');
}
function marcaTab(tab) {
  const marca = state.marcaActiva.marca;
  if (tab === 'calendario') return marcaCalendario(marca);
  if (tab === 'ciclo') return marcaCiclo(marca);
  if (tab === 'metricas') return marcaMetricas(marca);
  if (tab === 'estrategia') return marcaEstrategia(marca);
  if (tab === 'archivos') return marcaArchivos(marca);
}

/* --- Ciclo: configuración (pactado) + Pactado vs. Realizado (automático) --- */
const CICLO_TIPOS = [['reels', 'Reels'], ['carruseles', 'Carruseles'], ['posts', 'Posts'], ['banners', 'Banners'], ['historias', 'Historias']];
async function marcaCiclo(marca) {
  const pane = $('#marcaPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando ciclo…</div>';
  const { data } = await api('/api/marca/ciclo?marca=' + encodeURIComponent(marca));
  const pac = data.pactado || {}, real = data.realizado || {};
  const isAdmin = (state.me || {}).role === 'admin';
  const totalPac = CICLO_TIPOS.reduce((s, [k]) => s + (+pac[k] || 0), 0);
  const totalReal = CICLO_TIPOS.reduce((s, [k]) => s + (+real[k] || 0), 0);
  const configAdmin = `
    <div class="est-ctx">
      <h4>📅 Configuración del ciclo <span class="hub-hint" style="display:inline;margin:0">— lo pactado con el cliente</span></h4>
      <div class="est-ctx-grid">
        <label class="select"><span>Periodo</span><input id="clPeriodo" value="${esc(data.periodo || '')}" placeholder="Septiembre 2026"></label>
        <label class="select"><span>Inicio</span><input id="clInicio" type="date" value="${esc(data.inicio || '')}"></label>
        <label class="select"><span>Fin</span><input id="clFin" type="date" value="${esc(data.fin || '')}"></label>
      </div>
      <div class="ciclo-pactado">${CICLO_TIPOS.map(([k, l]) => `
        <label class="select"><span>${l}</span><input id="cl_${k}" type="number" min="0" value="${esc(pac[k] || 0)}"></label>`).join('')}</div>
      <button class="btn btn--ghost btn--sm" id="clSave" style="margin-top:.7rem">Guardar ciclo</button>
    </div>`;
  const configLectura = `
    <div class="est-ctx">
      <h4>📅 Ciclo <span class="hub-hint" style="display:inline;margin:0">— configurado por el admin</span></h4>
      <div class="ciclo-ro">
        <div><span>Periodo</span><b>${esc(data.periodo || '—')}</b></div>
        <div><span>Inicio</span><b>${esc(data.inicio || '—')}</b></div>
        <div><span>Fin</span><b>${esc(data.fin || '—')}</b></div>
        ${CICLO_TIPOS.map(([k, l]) => `<div><span>${l} pactados</span><b>${esc(pac[k] || 0)}</b></div>`).join('')}
      </div>
      <p class="hub-hint" style="margin-top:.5rem">Solo el administrador puede editar ciclos, fechas y cantidades.</p>
    </div>`;
  pane.innerHTML = (isAdmin ? configAdmin : configLectura) + `
    <div class="ciclo-vs">
      <div class="ciclo-vs__head"><h4>Pactado vs. Realizado</h4><span class="g-card__meta">${totalReal}/${totalPac} del ciclo</span></div>
      ${CICLO_TIPOS.filter(([k]) => (+pac[k] || 0) > 0 || (+real[k] || 0) > 0).map(([k, l]) => {
        const p = +pac[k] || 0, r = +real[k] || 0, pct = p ? Math.min(100, Math.round(r / p * 100)) : (r ? 100 : 0);
        const done = p && r >= p;
        return `<div class="ciclo-row">
          <div class="ciclo-row__top"><b>${l}</b><span>${r} / ${p || '—'} ${done ? '✅' : ''}</span></div>
          <div class="ciclo-bar"><div class="ciclo-bar__fill ${done ? 'ciclo-bar__fill--done' : ''}" style="width:${pct}%"></div></div>
        </div>`;
      }).join('') || '<div class="hub-empty">Define lo pactado arriba para ver el avance.</div>'}
      <p class="hub-hint" style="margin-top:.6rem">El "realizado" se cuenta solo: cada pieza que llega a <b>Publicada</b> suma aquí. No se digita.</p>
    </div>`;
  const clSave = $('#clSave');
  if (clSave) clSave.addEventListener('click', async () => {
    const body = { marca, periodo: $('#clPeriodo').value, inicio: $('#clInicio').value, fin: $('#clFin').value };
    CICLO_TIPOS.forEach(([k]) => body[k] = $('#cl_' + k).value);
    const { ok, data } = await api('/api/marca/ciclo', { method: 'POST', body });
    if (!ok || data.error) { alert(data.error || 'No se pudo guardar'); return; }
    marcaCiclo(marca);
  });
}

/* --- Calendario de la marca (grid mensual) + Agregar creativo --- */
const TIPOS_CREATIVO = ['Post', 'Carrusel', 'Reel', 'Banner', 'Historia'];
function buildMonthGrid(piezas, refISO) {
  const [y, m] = refISO.split('-').map(Number);
  const ym = `${y}-${String(m).padStart(2, '0')}`;
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const dias = new Date(y, m, 0).getDate();
  const porDia = {};
  piezas.forEach(p => { if (p.fecha.slice(0, 7) === ym) (porDia[p.fecha] || (porDia[p.fecha] = [])).push(p); });
  const hoyISO = new Date().toISOString().slice(0, 10);
  let celdas = '';
  DIAS_SEM.forEach(d => celdas += `<div class="cal__dow">${d}</div>`);
  for (let i = 0; i < offset; i++) celdas += '<div class="cal__cell cal__cell--empty"></div>';
  for (let d = 1; d <= dias; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const items = porDia[iso] || [];
    celdas += `<div class="cal__cell ${iso === hoyISO ? 'cal__cell--hoy' : ''}">
      <div class="cal__num">${d}</div>
      ${items.map(p => `<div class="cal__item cal-pz" data-id="${p.id}" title="${esc(p.idea || '')} · ${esc(p.etapa || '')}"><span class="cal__dot cal__dot--${esc(p.etapa)}"></span>${esc(p.tipo || '')}</div>`).join('')}
    </div>`;
  }
  return { label: `${CAL_MESES[m - 1]} ${y}`, html: `<div class="cal">${celdas}</div>` };
}
async function marcaCalendario(marca) {
  const pane = $('#marcaPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando calendario…</div>';
  const { data } = await api('/api/piezas'); state.hubBoard = data;
  const mine = Object.values(data.columnas || {}).flat().filter(p => p.marca === marca);
  state.piezas = state.piezas || {}; mine.forEach(p => state.piezas[p.id] = p);
  const creativos = mine.filter(p => p.tipo !== 'Historia').length;
  const historias = mine.filter(p => p.tipo === 'Historia').length;
  const conFecha = mine.filter(p => p.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const sinFecha = mine.filter(p => !p.fecha);
  const ref = (conFecha[0] && conFecha[0].fecha) || new Date().toISOString().slice(0, 10);
  const cal = buildMonthGrid(conFecha, ref);
  let html = `<div class="marca-cal-top">
      <div class="marca-cal-counts">
        <span class="mc-count"><b>${creativos}</b> creativos</span>
        <span class="mc-count mc-count--hist"><b>${historias}</b> historias</span>
      </div>
      <button class="btn btn--primary btn--sm" id="addCreativo">+ Agregar creativo</button>
    </div>`;
  html += `<div class="marca-cal-month">${cal.label}</div>` + cal.html;
  if (sinFecha.length) {
    html += `<h4 class="marca-cal-sub">Sin fecha asignada</h4><div class="hub-cal">` + sinFecha.map(p => `
      <button class="hub-cal__item hub-pieza" data-id="${p.id}">
        <span class="hub-cal__tipo">${esc(p.tipo || '')}</span>
        <span class="hub-cal__idea">${esc(p.idea || '(sin título)')}</span>
        <span class="hub-cal__etapa">${esc(p.etapa || '')}</span>
      </button>`).join('') + `</div>`;
  }
  pane.innerHTML = html;
  $('#addCreativo').addEventListener('click', () => openAgregarCreativo(marca));
  pane.querySelectorAll('.cal-pz, .hub-pieza').forEach(el => el.addEventListener('click', () => openPieza(el.dataset.id)));
}
function openAgregarCreativo(marca) {
  const html = `<div class="g-modal" id="acModal"><div class="g-modal__box glass">
      <h3 style="margin-bottom:.9rem">Agregar creativo · ${esc(marca)}</h3>
      <label class="select" style="margin-bottom:.7rem"><span>Tipo</span>
        <select id="acTipo">${TIPOS_CREATIVO.map(t => `<option${t === 'Reel' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <p class="hub-hint" id="acHint">Los creativos cuentan al ciclo. Las historias se cuentan aparte.</p>
      <label class="select" style="margin-bottom:.7rem"><span>Idea / título</span><input id="acIdea" placeholder="De qué trata"></label>
      <label class="select" style="margin-bottom:.7rem"><span>Fecha (opcional)</span><input id="acFecha" type="date"></label>
      <div class="g-modal__actions">
        <button class="btn btn--ghost btn--sm" id="acCancel">Cancelar</button>
        <button class="btn btn--primary btn--sm" id="acSave">Crear</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const close = () => $('#acModal').remove();
  const tipoSel = $('#acTipo'), hint = $('#acHint');
  tipoSel.addEventListener('change', () => { hint.textContent = tipoSel.value === 'Historia' ? 'Las historias se cuentan aparte del ciclo de creativos.' : 'Los creativos cuentan al ciclo. Las historias se cuentan aparte.'; });
  $('#acCancel').addEventListener('click', close);
  $('#acModal').addEventListener('click', e => { if (e.target.id === 'acModal') close(); });
  $('#acSave').addEventListener('click', async () => {
    const idea = $('#acIdea').value.trim();
    if (!idea) { $('#acIdea').focus(); return; }
    await api('/api/piezas/crear', { method: 'POST', body: { marca, tipo: tipoSel.value, idea, fecha: $('#acFecha').value || null } });
    close();
    marcaCalendario(marca);
  });
}

/* --- Métricas de la marca --- */
async function marcaMetricas(marca) {
  const pane = $('#marcaPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>Leyendo métricas…</div>';
  if (!state.metricas) { const r = await api('/api/metricas'); if (r.ok) state.metricas = r.data; }
  const key = normKey(marca);
  const m = (state.metricas && state.metricas.marcas || []).find(x => normKey(x.marca) === key || normKey(x.marca).includes(key) || key.includes(normKey(x.marca)));
  if (!m) { pane.innerHTML = '<div class="hub-empty">Esta marca aún no tiene métricas en el Portal de clientes.</div>'; return; }
  const idx = state.metricas.marcas.indexOf(m);
  pane.innerHTML = `<div class="hub-metrics-top">
      <div class="g-stat"><b>${m.total || 0}</b><span>publicaciones</span></div>
      <div class="g-stat"><b>${fmtViews(m.medianaViews)}</b><span>mediana views</span></div>
    </div>
    <div class="kv"><b>⬆ Lo que más funcionó</b>${m.mejores.map(p => metricRow(p)).join('')}</div>
    <div class="kv"><b>⬇ Lo que menos funcionó</b>${m.peores.map(p => metricRow(p)).join('')}</div>
    <button class="btn btn--primary btn--sm m-ia" data-i="${idx}">Análisis con IA</button>
    <div class="m-ia-out" id="mia-${idx}"></div>`;
  pane.querySelector('.m-ia').addEventListener('click', (e) => analizarMarca(idx, e.target));
}

/* --- Archivos de la marca: Drive + logos + manual --- */
function hubFileRow(f) {
  const isImg = (f.mime || '').startsWith('image/');
  const kb = f.size >= 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
  return `<div class="hub-file">
    ${isImg ? `<img class="hub-file__thumb" src="/api/archivos/file?id=${f.id}" alt="">` : `<div class="hub-file__thumb hub-file__thumb--doc">📄</div>`}
    <div class="hub-file__meta"><b>${esc(f.name)}</b><span>${kb}${f.by ? ' · ' + esc(f.by.split(' ')[0]) : ''}</span></div>
    <a class="hub-file__act" href="/api/archivos/file?id=${f.id}&dl=1" title="Descargar">⬇</a>
    <button class="hub-file__act hub-file__del" data-id="${f.id}" title="Quitar">✕</button>
  </div>`;
}
function hubFileSection(label, tipo, files, hint, accept) {
  return `<div class="hub-files">
    <div class="hub-files__head"><h4>${label}</h4>
      <label class="btn btn--ghost btn--sm hub-up">⬆ Subir<input type="file" hidden class="hub-file-input" data-tipo="${tipo}" accept="${accept}"></label>
    </div>
    <p class="hub-hint">${esc(hint)}</p>
    ${files.length ? '<div class="hub-file-list">' + files.map(f => hubFileRow(f)).join('') + '</div>' : '<div class="hub-empty">Nada subido aún.</div>'}
  </div>`;
}
async function marcaArchivos(marca) {
  const pane = $('#marcaPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando archivos…</div>';
  const { data } = await api('/api/archivos/marca?m=' + encodeURIComponent(marca));
  const isAdmin = (state.me || {}).role === 'admin';
  const logos = data.files.filter(f => f.tipo === 'logo');
  const manual = data.files.filter(f => f.tipo === 'manual');
  let html = `<div class="hub-drive">
      ${data.drive
      ? `<a class="btn btn--primary btn--sm" href="${esc(data.drive)}" target="_blank" rel="noopener">📂 Carpeta de Drive del cliente</a>`
      : `<span class="hub-drive__none">📂 Sin carpeta de Drive${isAdmin ? '' : ' — pídele el link al admin'}</span>`}
      ${isAdmin ? `<div class="hub-drive__edit">
        <input type="url" id="drvInput" placeholder="Link de la carpeta de Drive…" value="${esc(data.drive || '')}">
        <button class="btn btn--ghost btn--sm" id="drvSave">Guardar</button></div>` : ''}
    </div>`;
  html += hubFileSection('Logos', 'logo', logos, 'PNG, SVG o JPG del logo. Cualquiera del equipo puede subir.', 'image/*');
  html += hubFileSection('Manual de marca', 'manual', manual, 'El PDF del manual / identidad de marca (o imágenes).', 'application/pdf,image/*');
  pane.innerHTML = html;
  const drvSave = $('#drvSave');
  if (drvSave) drvSave.addEventListener('click', async () => {
    await api('/api/archivos/drive', { method: 'POST', body: { marca, url: $('#drvInput').value.trim() } });
    marcaArchivos(marca);
  });
  pane.querySelectorAll('.hub-file-input').forEach(inp => inp.addEventListener('change', async () => {
    const file = inp.files[0]; if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert('El archivo supera 20 MB.'); inp.value = ''; return; }
    const lab = inp.closest('.hub-up'); const orig = lab.innerHTML; lab.textContent = 'Subiendo…';
    try {
      const dataBase64 = await fileToBase64(file);
      const r = await api('/api/archivos/upload', { method: 'POST', body: { marca, tipo: inp.dataset.tipo, name: file.name, mime: file.type, dataBase64 } });
      if (!r.ok || r.data.ok === false) throw new Error((r.data && r.data.error) || 'No se pudo subir');
      marcaArchivos(marca);
    } catch (e) { lab.innerHTML = orig; alert(e.message || 'No se pudo subir'); }
  }));
  pane.querySelectorAll('.hub-file__del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Quitar este archivo?')) return;
    await api('/api/archivos/remove', { method: 'POST', body: { id: b.dataset.id } });
    marcaArchivos(marca);
  }));
}

/* --- Estrategia de la marca: contexto + generadores (hashtags, ideas, captions) --- */
const APRENDE_KIND = { nota: '📌 Nota de marca', info: '🔎 Información', insight: '💡 Aprendizaje', ganador: '🏆 Ya funcionó' };
async function marcaEstrategia(marca) {
  const pane = $('#marcaPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando estrategia…</div>';
  const [{ data: ctx }, ap] = await Promise.all([
    api('/api/marca/contexto?marca=' + encodeURIComponent(marca)),
    api('/api/marca/aprendizaje?marca=' + encodeURIComponent(marca))
  ]);
  state.aprendizaje = ap.ok ? ap.data.entries : [];
  pane.innerHTML = `
    <div class="est-ctx">
      <h4>📋 Contexto de la marca <span class="hub-hint" style="display:inline;margin:0">— cada marca es un mundo; esto hace que la estrategia sea única</span></h4>
      ${!ctx.completo ? '<div class="est-ctx-alert">⚠️ Completa al menos <b>Industria</b>, <b>Servicios/productos</b> y <b>Tono</b> para activar la estrategia a la medida de esta marca.</div>' : ''}
      <div class="est-ctx-grid">
        <label class="select"><span>Industria / sector</span><input id="esIndustria" value="${esc(ctx.industria || '')}" placeholder="inmobiliario, café, legal…"></label>
        <label class="select"><span>País / mercado</span><input id="esPais" value="${esc(ctx.pais || '')}" placeholder="Colombia"></label>
        <label class="select"><span>Tipo de clientes</span><input id="esTipoClientes" value="${esc(ctx.tipoClientes || '')}" placeholder="a quién le vende"></label>
        <label class="select"><span>Público objetivo</span><input id="esPublico" value="${esc(ctx.publico || '')}" placeholder="edad, intereses…"></label>
        <label class="select"><span>Tono de voz</span><input id="esTono" value="${esc(ctx.tono || '')}" placeholder="cercano, premium…"></label>
        <label class="select"><span>Cómo se comunica</span><input id="esComunicacion" value="${esc(ctx.comunicacion || '')}" placeholder="directa, educativa, divertida…"></label>
      </div>
      <label class="select" style="margin-top:.6rem"><span>Servicios / productos</span><textarea id="esServicios" rows="2" placeholder="qué vende u ofrece la marca">${esc(ctx.servicios || '')}</textarea></label>
      <label class="select" style="margin-top:.6rem"><span>Notas / do's & don'ts</span><textarea id="esNotas" rows="2" placeholder="qué mencionar, qué evitar…">${esc(ctx.notas || '')}</textarea></label>
      <button class="btn btn--ghost btn--sm" id="esCtxSave" style="margin-top:.6rem">Guardar contexto</button>
    </div>

    <div class="est-learn">
      <h4>🧠 Línea de aprendizaje <span class="hub-hint" style="display:inline;margin:0">— la marca aprende; esto alimenta captions e historias</span></h4>
      <div class="est-learn-add">
        <select id="apKind">${Object.keys(APRENDE_KIND).map(k => `<option value="${k}">${APRENDE_KIND[k]}</option>`).join('')}</select>
        <input id="apTexto" placeholder="Enséñale algo a la marca (un dato, una regla, algo que funcionó…)">
        <button class="btn btn--ghost btn--sm" id="apAdd">Agregar</button>
      </div>
      <div class="est-learn-search">
        <input id="apBuscar" placeholder="…o busca info por tema (ej: tasas hipotecarias 2026)">
        <button class="btn btn--ghost btn--sm" id="apBuscarBtn">🔎 Buscar y aprender</button>
      </div>
      <div id="apList" class="est-learn-list">${renderAprende()}</div>
    </div>

    <div class="est-gen">
      <div class="est-gen-bar">
        <input id="esTema" placeholder="Tema del contenido (ej: lanzamiento de producto)">
        <select id="esPlat"><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="linkedin">LinkedIn</option></select>
      </div>
      <div class="est-gen-btns">
        <button class="btn btn--primary btn--sm est-run" data-kind="captions">✍️ Captions</button>
        <button class="btn btn--ghost btn--sm est-run" data-kind="historias">📖 Historias</button>
        <button class="btn btn--ghost btn--sm est-run" data-kind="hashtags"># Hashtags · palabras clave</button>
        <button class="btn btn--ghost btn--sm est-run" data-kind="ideas">💡 Ideas / estrategia</button>
      </div>
      <div id="esOut"></div>
    </div>`;
  $('#esCtxSave').addEventListener('click', async () => {
    await api('/api/marca/contexto', { method: 'POST', body: {
      marca, industria: $('#esIndustria').value, pais: $('#esPais').value, tipoClientes: $('#esTipoClientes').value,
      publico: $('#esPublico').value, tono: $('#esTono').value, comunicacion: $('#esComunicacion').value,
      servicios: $('#esServicios').value, notas: $('#esNotas').value
    } });
    $('#esCtxSave').textContent = 'Guardado ✓';
    const alert = $('.est-ctx-alert'); if (alert && $('#esIndustria').value && $('#esServicios').value && $('#esTono').value) alert.remove();
    setTimeout(() => { const b = $('#esCtxSave'); if (b) b.textContent = 'Guardar contexto'; }, 1500);
  });
  $('#apAdd').addEventListener('click', async () => {
    const texto = $('#apTexto').value.trim(); if (!texto) return;
    const { data } = await api('/api/marca/aprendizaje', { method: 'POST', body: { marca, kind: $('#apKind').value, texto } });
    if (data.ok) { state.aprendizaje.unshift(data.item); $('#apTexto').value = ''; refreshAprende(marca); }
  });
  $('#apBuscarBtn').addEventListener('click', async () => {
    const tema = $('#apBuscar').value.trim(); if (!tema) return;
    const btn = $('#apBuscarBtn'); loadingBtn(btn, 'Buscando…');
    const { data } = await api('/api/marca/aprendizaje/buscar', { method: 'POST', body: { marca, tema } });
    resetBtn(btn, '🔎 Buscar y aprender');
    if (data.entries) { state.aprendizaje = data.entries; $('#apBuscar').value = ''; refreshAprende(marca); }
  });
  bindAprendeRemove(marca);
  pane.querySelectorAll('.est-run').forEach(b => b.addEventListener('click', () => estGenerar(marca, b.dataset.kind, b)));
}
function renderAprende() {
  if (!state.aprendizaje || !state.aprendizaje.length) return '<div class="hub-empty">Aún no aprende nada de esta marca. Agrégale info o busca por tema.</div>';
  return state.aprendizaje.map(e => `<div class="learn-item">
    <span class="learn-kind">${(APRENDE_KIND[e.kind] || e.kind).split(' ')[0]}</span>
    <span class="learn-text">${esc(e.texto)}${e.fuente ? ` <em>· ${esc(e.fuente)}</em>` : ''}</span>
    <button class="learn-del" data-id="${e.id}" title="Quitar">✕</button>
  </div>`).join('');
}
function refreshAprende(marca) { const l = $('#apList'); if (l) { l.innerHTML = renderAprende(); bindAprendeRemove(marca); } }
function bindAprendeRemove(marca) {
  $$('#apList .learn-del').forEach(b => b.addEventListener('click', async () => {
    await api('/api/marca/aprendizaje/remove', { method: 'POST', body: { marca, id: b.dataset.id } });
    state.aprendizaje = state.aprendizaje.filter(x => x.id !== b.dataset.id);
    refreshAprende(marca);
  }));
}
async function estGenerar(marca, kind, btn) {
  const tema = $('#esTema').value.trim();
  const out = $('#esOut');
  // Cada marca es un mundo: exige el contexto mínimo antes de generar.
  if (!$('#esIndustria').value.trim() || !$('#esServicios').value.trim() || !$('#esTono').value.trim()) {
    out.innerHTML = '<div class="empty">📋 Primero completa el <b>contexto de la marca</b> (al menos Industria, Servicios/productos y Tono) y guárdalo. Así la estrategia sale a la medida de esta marca.</div>';
    return;
  }
  if (!tema) { out.innerHTML = '<div class="empty">Escribe el tema del contenido primero.</div>'; return; }
  const platform = $('#esPlat').value;
  const ctx = { industria: $('#esIndustria').value.trim(), pais: $('#esPais').value.trim(), tipoClientes: $('#esTipoClientes').value.trim(), comunicacion: $('#esComunicacion').value.trim(), servicios: $('#esServicios').value.trim(), tono: $('#esTono').value.trim(), publico: $('#esPublico').value.trim(), notas: $('#esNotas').value.trim() };
  const label = btn.textContent; loadingBtn(btn, '…');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Generando…</div>';
  try {
    if (kind === 'historias') {
      const { data } = await api('/api/historias', { method: 'POST', body: { marca, tema, contexto: ctx } });
      const hs = data.historias || [];
      out.innerHTML = hs.length ? `<div class="result-card"><h3>📖 Secuencia de historias ${sourcePill(data.source)} <span class="tag">cuenta aparte</span></h3>
        <div class="hist-seq">${hs.map(h => `<div class="hist-frame">
          <div class="hist-frame__n">${esc(h.frame || '')}</div>
          <div class="hist-frame__body"><div class="hist-frame__txt">${esc(h.texto || '')}</div>
            ${h.elemento ? `<span class="hist-el">🎯 ${esc(h.elemento)}</span>` : ''}
            ${h.objetivo ? `<div class="note">${esc(h.objetivo)}</div>` : ''}</div>
        </div>`).join('')}</div></div>` : '<div class="empty">No se pudieron generar historias.</div>';
    } else if (kind === 'hashtags') {
      const { data } = await api('/api/hashtags', { method: 'POST', body: { topic: tema, platform, country: 'co', category: '' } });
      renderHashtags(out, data);
    } else if (kind === 'ideas') {
      const { data } = await api('/api/ideas', { method: 'POST', body: { topic: tema, platform, country: 'co', category: '', count: 5 } });
      out.innerHTML = (data.ideas || []).map(x => `<div class="result-card">
        <h3>💡 ${esc(x.titulo || '')} ${sourcePill(data.source)}</h3>
        ${kv('Hook', x.hook)}${kv('Estructura', x.estructura)}${kv('Formato', x.formato)}${kv('Por qué funciona', x.por_que_funciona)}${kv('CTA', x.cta)}
      </div>`).join('') || '<div class="empty">No se pudo generar.</div>';
    } else {
      const { data } = await api('/api/captions', { method: 'POST', body: { topic: tema, platform, country: 'co', category: '', marca, contexto: ctx } });
      const caps = data.captions || [];
      out.innerHTML = caps.length ? caps.map((c, i) => `<div class="result-card">
        <h3>✍️ ${esc(c.angulo || 'Caption ' + (i + 1))} ${sourcePill(data.source)}</h3>
        <div class="caption-text" id="ecap-${i}">${esc(c.texto || '')}</div>
        <button class="btn btn--ghost btn--sm copy-btn" data-copy="ecap-${i}">Copiar</button>
        ${(c.hashtags || []).length ? `<div class="card__tags" style="margin-top:.6rem">${c.hashtags.map(h => `<span class="tag">${esc(h)}</span>`).join('')}</div>` : ''}
      </div>`).join('') : '<div class="empty">No se pudieron generar captions.</div>';
      bindCopy();
    }
  } catch (e) { out.innerHTML = '<div class="empty">Error al generar. Inténtalo de nuevo.</div>'; }
  resetBtn(btn, label);
}

/* ---------------- Panel: Métricas (Firebase real) ---------------- */
const NIVEL_INFO = {
  muy_alto: { t: 'Muy alto', c: 'st-green' }, alto: { t: 'Alto', c: 'st-green' },
  normal: { t: 'Normal', c: 'st-blue' }, bajo: { t: 'Bajo', c: 'st-red' },
  muy_bajo: { t: 'Muy bajo', c: 'st-red' }, sin_base: { t: '—', c: '' }
};
async function loadMetricas(refresh) {
  const out = $('#metricasOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Leyendo métricas reales del Portal de clientes…</div>';
  const { ok, data } = await api('/api/metricas' + (refresh ? '?refresh=1' : ''));
  if (!ok) { out.innerHTML = `<div class="empty">${esc(data.error || 'No se pudo leer Firebase')}. ${esc(data.detail || '')}</div>`; return; }
  state.metricasLoaded = true;
  state.metricas = data;
  out.innerHTML = `<div class="g-stats">
      <div class="g-stat"><b>${(data.marcas || []).length}</b><span>marcas con data</span></div>
      <div class="g-stat"><b>${data.totalPublicaciones || 0}</b><span>publicaciones</span></div>
      <div class="g-stat-note">Del <b>Portal de clientes</b> (Firebase) · toca una marca para ver su detalle</div>
    </div>
    <div class="acc">` + data.marcas.map((m, i) => `
      <div class="acc-item">
        <button class="acc-head" data-i="${i}">
          <div class="acc-head__l"><span class="acc-name">${esc(m.marca)}</span>
            <span class="acc-sub">${m.total || 0} posts · mediana ${fmtViews(m.medianaViews)} views</span></div>
          <span class="acc-chev">›</span>
        </button>
        <div class="acc-body hidden" id="accb-${i}"></div>
      </div>`).join('') + '</div>';
  $$('.acc-head').forEach(h => h.addEventListener('click', () => toggleMetrica(h.dataset.i, h)));
}
function toggleMetrica(i, head) {
  const body = $('#accb-' + i);
  const open = !body.classList.contains('hidden');
  if (open) { body.classList.add('hidden'); head.classList.remove('acc-head--open'); return; }
  const m = state.metricas.marcas[i];
  body.innerHTML = `
    <div class="kv"><b>⬆ Lo que más funcionó</b>${m.mejores.map(p => metricRow(p)).join('')}</div>
    <div class="kv"><b>⬇ Lo que menos funcionó</b>${m.peores.map(p => metricRow(p)).join('')}</div>
    <button class="btn btn--primary btn--sm m-ia" data-i="${i}">Análisis con IA</button>
    <div class="m-ia-out" id="mia-${i}"></div>`;
  body.classList.remove('hidden');
  head.classList.add('acc-head--open');
  body.querySelector('.m-ia').addEventListener('click', (e) => analizarMarca(i, e.target));
}
function metricRow(p) {
  const n = NIVEL_INFO[p.nivel] || NIVEL_INFO.sin_base;
  return `<div class="hash-item">
    <div><div class="tagname">${esc((p.desc || '').slice(0, 42))}</div><div class="note">${esc(p.type)} · ${fmtViews(p.views)} views · ${fmtViews(p.likes)} likes · eng ${p.engagement}%</div></div>
    <span class="g-status ${n.c}">${n.t}</span></div>`;
}
async function analizarMarca(i, btn) {
  const m = state.metricas.marcas[i];
  const box = $('#mia-' + i);
  loadingBtn(btn, 'Analizando…');
  box.innerHTML = '<div class="loading"><div class="spinner"></div>Analizando rendimiento…</div>';
  const { data } = await api('/api/metricas/analisis', { method: 'POST', body: {
    marca: m.marca, medianaViews: m.medianaViews, mejores: m.mejores, peores: m.peores
  }});
  resetBtn(btn, 'Análisis con IA');
  box.innerHTML = `<div class="radar-summary" style="margin-top:.8rem">${esc(data.diagnostico || '')} ${sourcePill(data.source)}</div>
    ${listBox('✅ Repetir', data.que_repetir)}
    ${listBox('⛔ Evitar', data.que_evitar)}
    ${listBox('⚡ Acciones', data.acciones)}`;
}
function listBox(title, arr) {
  if (!(arr || []).length) return '';
  return `<div class="radar-box" style="margin-top:.6rem"><h4>${esc(title)}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

/* ---------------- Área: Producción ---------------- */
function areaHeader(a) {
  if (!a) return '';
  return `<div class="result-card" style="margin-bottom:1rem">
    <h3>${a.icon} ${esc(a.area)}</h3>
    <div class="kv"><b>Qué hace esta área</b><p>${esc(a.funcion)}</p></div>
    <div class="kv"><b>Tareas · ${esc(a.dias)}</b><ul class="g-col__tasks" style="margin-top:.4rem">${a.tareas.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
  </div>`;
}
async function loadProduccion() {
  const out = $('#produccionOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando producción…</div>';
  const { data } = await api('/api/gestion/produccion');
  let html = areaHeader(data.area);
  html += '<h3 class="live-h3">📹 Por grabar (por marca)</h3>';
  if ((data.porGrabar || []).length) {
    html += '<div class="g-grid">' + data.porGrabar.slice(0, 12).map(p => `
      <div class="g-card">
        <div class="g-card__top"><div class="g-card__name">${esc(p.marca)}</div>
          <span class="g-status st-red">${p.pendientes || 0} por grabar</span></div>
        <div class="g-chips"><span class="g-chip">🧠 ${p.enBanco || 0} ideas en banco</span></div>
      </div>`).join('') + '</div>';
  } else html += '<div class="empty">Nada pendiente de grabar este ciclo.</div>';
  html += '<h3 class="live-h3">✅ Grabado (listo para Creativa)</h3>';
  if ((data.grabado || []).length) {
    html += '<div class="reddit-list">' + data.grabado.map(g => `
      <div class="reddit-item"><span class="reddit-t"><b>${esc(g.marca)}</b> · ${esc(g.tipo)}</span>
        <span class="reddit-sub">${esc(g.fecha || '')}</span></div>`).join('') + '</div>';
  } else html += '<div class="empty">Aún no hay material grabado en el pipeline.</div>';
  out.innerHTML = html;
}

/* ---------------- Área: Pauta (real, desde el portal de clientes) ---------------- */
function fmtMoney(cop, moneda, trm) {
  cop = cop || 0;
  if (moneda === 'USD') {
    const usd = cop / (trm || 4000);
    return 'US$ ' + usd.toLocaleString('en-US', { maximumFractionDigits: usd < 100 ? 1 : 0 });
  }
  return '$ ' + Math.round(cop).toLocaleString('es-CO');
}
async function loadPauta() {
  const out = $('#pautaOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Leyendo la pauta del Portal de clientes…</div>';
  const { ok, data } = await api('/api/pauta');
  if (!ok) { out.innerHTML = `<div class="empty">${esc(data.error || 'No se pudo leer la pauta')}</div>`; return; }
  state.pauta = data;
  renderPauta();
}
function renderPauta() {
  const data = state.pauta;
  const out = $('#pautaOut');
  const moneda = (data.cfg && data.cfg.moneda) || 'COP';
  const trm = (data.cfg && data.cfg.trm) || 4000;
  const M = c => fmtMoney(c, moneda, trm);
  if (data.error) { out.innerHTML = `<div class="empty">No se pudo conectar con la pauta del portal.<br><small>${esc(data.error)}</small></div>`; return; }

  let html = `<div class="pauta-bar">
      <div class="g-stats" style="margin:0">
        <div class="g-stat"><b>${data.marcas.length}</b><span>marcas con pauta</span></div>
        <div class="g-stat"><b>${M(data.gastoSemanaTotal)}</b><span>gasto / semana</span></div>
        <div class="g-stat"><b>${M(data.total)}</b><span>invertido total</span></div>
      </div>
      <div class="pauta-money">
        <div class="seg" id="pMoneda">
          <button class="seg__btn ${moneda === 'COP' ? 'active' : ''}" data-mon="COP">Pesos (COP)</button>
          <button class="seg__btn ${moneda === 'USD' ? 'active' : ''}" data-mon="USD">Dólares (USD)</button>
        </div>
        ${moneda === 'USD' ? `<label class="pauta-trm">TRM <input type="number" id="pTRM" min="1" value="${trm}"> COP/US$</label>` : ''}
      </div>
    </div>
    <p class="topbar__sub" style="margin:.2rem .2rem 1rem">Conectado al <b>visual de pauta del Portal de clientes</b> (Firebase). El gasto por semana se calcula con la inversión y los días de cada campaña.</p>`;

  if (!data.marcas.length) {
    html += '<div class="empty">Aún no hay campañas de pauta registradas en el portal.</div>';
  } else {
    html += '<div class="stack">' + data.marcas.map(m => `
      <div class="result-card pauta-card">
        <div class="pauta-card__l">
          <div class="g-card__name">${esc(m.marca)}</div>
          <div class="g-card__sector">${m.registros} campaña${m.registros === 1 ? '' : 's'}${m.ultimoPeriodo ? ' · ' + esc(m.ultimoPeriodo) : ''}</div>
        </div>
        <div class="pauta-card__week"><span>Gasto / semana</span><b>${M(m.gastoSemana)}</b></div>
        <div class="pauta-metrics">
          <div class="p-field"><span>Invertido</span><b>${M(m.invertido)}</b></div>
          <div class="p-field"><span>Alcance</span><b>${fmtViews(m.alcance)}</b></div>
          <div class="p-field"><span>Clicks</span><b>${fmtViews(m.clicks)}</b></div>
          <div class="p-field"><span>Anuncios</span><b>${m.anuncios || 0}</b></div>
        </div>
      </div>`).join('') + '</div>';
  }
  out.innerHTML = html;

  $$('#pMoneda .seg__btn').forEach(b => b.addEventListener('click', async () => {
    const mon = b.dataset.mon;
    state.pauta.cfg = state.pauta.cfg || {};
    state.pauta.cfg.moneda = mon;
    renderPauta();
    await api('/api/pauta/moneda', { method: 'POST', body: { moneda: mon } });
  }));
  const trmInp = $('#pTRM');
  if (trmInp) trmInp.addEventListener('change', async () => {
    state.pauta.cfg.trm = parseInt(trmInp.value, 10) || 4000;
    renderPauta();
    await api('/api/pauta/moneda', { method: 'POST', body: { moneda: 'USD', trm: state.pauta.cfg.trm } });
  });
}

/* ---------------- Mi día (inicio) ---------------- */
const FRASES = [
  'Hoy es un gran día para crear algo que valga la pena.',
  'La constancia vence al talento. Un paso más hoy.',
  'Lo que publicas hoy construye la marca de mañana.',
  'Menos ruido, más intención. A por el día.',
  'Cada pieza cuenta una historia. Haz que la tuya enganche.',
  'La calidad no es un acto, es un hábito. Hoy también.',
  'El mejor contenido nace de entender al cliente. Escucha y crea.',
  'Enfócate en lo que mueve la aguja. Prioriza y ejecuta.',
  'Las ideas se vuelven marca cuando se ejecutan. ¡Vamos!',
  'Hazlo simple, hazlo claro, hazlo memorable.'
];
function fraseDelDia() {
  const d = new Date();
  const idx = (d.getFullYear() * 366 + (d.getMonth() * 31) + d.getDate()) % FRASES.length;
  return FRASES[idx];
}
function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
const DIAS_SEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
async function loadInicio() {
  const out = $('#inicioOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando tu día…</div>';
  const { data } = await api('/api/team/mytasks');
  const me = data.me || {}, tasks = data.tasks || [];
  const hoyISO = new Date().toISOString().slice(0, 10);
  const hoy = tasks.filter(t => t.status !== 'hecho' && (t.overdue || t.dueDate === hoyISO || !t.dueDate));
  // Próximas tareas: con fecha dentro de esta semana, después de hoy, sin terminar.
  const ws = startOfWeek(new Date());
  const finSemana = new Date(ws); finSemana.setDate(ws.getDate() + 6);
  const finISO = finSemana.toISOString().slice(0, 10);
  const proximas = tasks
    .filter(t => t.status !== 'hecho' && t.dueDate && t.dueDate > hoyISO && t.dueDate <= finISO)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const frase = fraseDelDia();
  $('#viewSub').textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  let html = `<div class="hello">
      <h2>${saludo}, ${esc((me.name || '').split(' ')[0] || 'Versus')} 👋</h2>
      <p class="hello__frase">${esc(frase)}</p>
    </div>`;

  // Dos cuadros: Tareas de hoy · Próximas de la semana
  html += '<div class="mid-grid">';
  html += `<section class="mid-box">
      <div class="mid-box__head"><h3>📌 Tareas de hoy</h3><span class="g-card__meta">${hoy.length} pendiente${hoy.length === 1 ? '' : 's'}</span></div>
      ${hoy.length ? '<div class="stack">' + hoy.map(t => taskCard(t, true)).join('') + '</div>'
        : '<div class="empty">Nada urgente para hoy. 🎉</div>'}
    </section>`;
  html += `<section class="mid-box">
      <div class="mid-box__head"><h3>🗓️ Próximas esta semana</h3><span class="g-card__meta">${proximas.length}</span></div>
      ${proximas.length ? '<div class="stack">' + proximas.map(t => taskCard(t, true)).join('') + '</div>'
        : '<div class="empty">Sin tareas programadas para el resto de la semana.</div>'}
    </section>`;
  html += '</div>';

  // Accesos rápidos: el trabajo entra por Marcas y Gestión.
  const tools = [['archivos', 'Ir a Marcas'], ['gestion', 'Ver Gestión']];
  html += `<h3 class="live-h3">Ir al trabajo</h3>
    <div class="quick">${tools.map(([v, l]) => `<button class="quick__btn" data-goto="${v}">${esc(l)}</button>`).join('')}</div>`;
  out.innerHTML = html;
  bindTaskActions(loadInicio);
  $$('.quick__btn').forEach(b => b.addEventListener('click', () => {
    const item = document.querySelector(`.nav__item[data-view="${b.dataset.goto}"]`);
    if (item) item.click();
  }));
}

/* ---------------- Calendario compartido ---------------- */
const CAL_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
async function loadCalendario() {
  const out = $('#calendarioOut');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando calendario…</div>';
  // Usa las PIEZAS reales (con id + etapa) para que cada una abra su ficha.
  const { data } = await api('/api/piezas');
  const piezas = Object.values(data.columnas || {}).flat().filter(p => p.fecha);
  state.piezas = state.piezas || {};
  piezas.forEach(p => state.piezas[p.id] = p);
  // Mes: el del primer item, o el actual.
  const ref = piezas[0] ? piezas[0].fecha : new Date().toISOString().slice(0, 10);
  const [y, m] = ref.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const dias = new Date(y, m, 0).getDate();
  const porDia = {};
  piezas.forEach(p => { if (p.fecha.slice(0, 7) === `${y}-${String(m).padStart(2, '0')}`) (porDia[p.fecha] || (porDia[p.fecha] = [])).push(p); });
  const hoyISO = new Date().toISOString().slice(0, 10);

  let celdas = '';
  DIAS_SEM.forEach(d => celdas += `<div class="cal__dow">${d}</div>`);
  for (let i = 0; i < offset; i++) celdas += '<div class="cal__cell cal__cell--empty"></div>';
  for (let d = 1; d <= dias; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const items = porDia[iso] || [];
    celdas += `<div class="cal__cell ${iso === hoyISO ? 'cal__cell--hoy' : ''}">
      <div class="cal__num">${d}</div>
      ${items.map(p => `<div class="cal__item cal-pz" data-id="${p.id}" title="${esc(p.marca)} · ${esc(p.tipo)} · ${esc(p.etapa)}"><span class="cal__dot cal__dot--${esc(p.etapa)}"></span>${esc(p.marca)}</div>`).join('')}
    </div>`;
  }
  out.innerHTML = `<p class="topbar__sub" style="margin-bottom:1rem">${porDia && piezas.length} piezas en ${esc(CAL_MESES[m - 1])} ${y} · toca una para ver el guion y la etapa</p>
    <div class="cal">${celdas}</div>`;
  $$('.cal-pz').forEach(el => el.addEventListener('click', () => openPieza(el.dataset.id)));
}

/* ---------------- Tendencias: modo En vivo / Biblioteca ---------------- */
$$('#trendMode .seg__btn').forEach(b => b.addEventListener('click', () => setTrendMode(b.dataset.mode)));
['#fNiche', '#fCountry'].forEach(id => $(id).addEventListener('change', () => state.trendMode === 'live' ? loadLive() : loadTrends()));
['#fPlatform', '#fType'].forEach(id => $(id).addEventListener('change', loadTrends));
let queryTimer;
$('#fQuery').addEventListener('input', () => { clearTimeout(queryTimer); queryTimer = setTimeout(loadTrends, 250); });
$('#liveRefresh').addEventListener('click', () => loadLive(true));

function setTrendMode(mode) {
  state.trendMode = mode;
  $$('#trendMode .seg__btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const isLive = mode === 'live';
  $('#liveArea').classList.toggle('hidden', !isLive);
  $('#trendsGrid').classList.toggle('hidden', isLive);
  $$('[data-libonly]').forEach(el => el.classList.toggle('hidden', isLive));
  $$('[data-liveonly]').forEach(el => el.classList.toggle('hidden', !isLive));
  $('#fTopic').classList.toggle('hidden', !isLive);
  $('#fTopic').parentElement.classList.toggle('hidden', !isLive);
  if (isLive) {
    if (!$('#fTopic').value) $('#fTopic').value = 'café en grano';
    if (!$('#fCountry').value) $('#fCountry').value = 'CO';
    loadLive();
  } else {
    loadTrends();
  }
}

async function loadLive(refresh) {
  const area = $('#liveArea');
  const topic = $('#fTopic').value.trim(), country = $('#fCountry').value;
  if (!topic || !country) {
    area.innerHTML = '<div class="empty">Escribe un <b>tema</b> y elige <b>país</b> para ver el contenido en tendencia de hoy.</div>';
    return;
  }
  area.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando el contenido en tendencia de hoy…</div>';
  const params = new URLSearchParams({ topic, country });
  const { data } = await api('/api/live-trends?' + params.toString());
  renderLive(area, data, topic, country);
}
$('#fTopic').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadLive(); } });

function fmtViews(n) { n = +n || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n); }

function renderLive(area, d, topic, country) {
  const nicheL = topic;
  const countryL = (state.meta.countries.find(x => x.code === country) || {}).label || country;
  const when = d.updatedAt ? new Date(d.updatedAt).toLocaleString('es') : '';
  let html = `<div class="live-head">
      <div><b>${esc(nicheL)}</b> · ${esc(countryL)} <span class="live-when">· actualizado ${esc(when)}</span></div>
    </div>`;

  html += '<div class="link-row">' + (d.links || []).map(l => `
      <a class="link-btn plat-${l.platform}" href="${esc(l.url)}" target="_blank" rel="noopener">
        <b>${PLATFORM_LABEL[l.platform]}</b><span>${esc(l.label)} ↗</span>
      </a>`).join('') + '</div>';

  html += `<div class="note-card">Estos botones abren el <b>contenido en tendencia real</b> de ${esc(nicheL)} en ${esc(countryL)},
      directo en cada plataforma. Para un análisis con IA de qué publicar, usa el <b>Radar</b>.</div>`;
  area.innerHTML = html;
}

async function loadTrends() {
  const grid = $('#trendsGrid');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando tendencias…</div>';
  const params = new URLSearchParams();
  const map = { fNiche: 'niche', fCountry: 'country', fPlatform: 'platform', fType: 'type', fQuery: 'q' };
  for (const [id, key] of Object.entries(map)) { const v = $('#' + id).value.trim(); if (v) params.set(key, v); }
  const { data } = await api('/api/trends?' + params.toString());
  renderTrends(data.trends || []);
}

function renderTrends(list) {
  const grid = $('#trendsGrid');
  if (!list.length) { grid.innerHTML = '<div class="empty">No hay tendencias con esos filtros. Prueba con otros.</div>'; return; }
  const countryLabel = c => (state.meta.countries.find(x => x.code === c) || {}).label || c;
  const nicheLabel = n => (state.meta.niches.find(x => x.slug === n) || {}).label || n;
  grid.innerHTML = list.map(t => `
    <article class="card">
      <div class="card__top">
        <span class="card__title">${esc(t.title)}</span>
        <span class="badge-eng eng-${t.engagement}">${t.engagement}</span>
      </div>
      <div class="card__tags">
        <span class="tag tag--red">${nicheLabel(t.niche)}</span>
        <span class="tag">${countryLabel(t.country)}</span>
        <span class="tag">${t.type === 'ads' ? '📣 Anuncio' : '🌱 Orgánico'}</span>
        ${t.platforms.map(p => `<span class="tag tag--platform">${PLATFORM_LABEL[p]}</span>`).join('')}
      </div>
      <div class="card__hook">“${esc(t.hook)}”</div>
      <div>
        <div class="card__label">Estructura ganadora · ${esc(t.format)}</div>
        <div class="card__struct">${esc(t.structure)}</div>
      </div>
      <div>
        <div class="card__label">Por qué funciona</div>
        <div class="card__why">${esc(t.whyItWorks)}</div>
      </div>
      <div class="card__tags">${(t.hashtags || []).map(h => `<span class="tag">${esc(h)}</span>`).join('')}</div>
    </article>
  `).join('');
}

/* ---------------- Radar de tendencias ---------------- */
$('#rGenerate').addEventListener('click', () => loadRadar(false));
$('#rRefresh').addEventListener('click', () => loadRadar(true));

async function loadRadar(refresh) {
  const out = $('#radarOut');
  const topic = $('#rTopic').value.trim();
  const country = $('#rCountry').value, category = $('#rCategory').value;
  if (!topic) { out.innerHTML = '<div class="empty">Escribe cualquier palabra o tema para analizar.</div>'; $('#rTopic').focus(); return; }
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Cruzando Google Trends y Google News… analizando…</div>';
  const params = new URLSearchParams({ topic, country });
  if (category) params.set('category', category);
  if (refresh) params.set('refresh', '1');
  const { ok, data } = await api('/api/radar?' + params.toString());
  if (!ok) { out.innerHTML = `<div class="empty">${esc(data.error || 'No se pudo generar el radar.')}</div>`; return; }
  renderRadar(out, data, topic, country);
}
// Enter en el campo dispara el análisis.
$('#rTopic').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadRadar(false); } });

function renderRadar(out, d, topic, country) {
  const countryL = (state.meta.countries.find(x => x.code === country) || {}).label || country;
  const catL = (( state.meta.contentCategories || []).find(c => c.slug === d.category) || {}).label;
  const when = d.updatedAt ? new Date(d.updatedAt).toLocaleString('es') : '';
  const a = d.analysis || {};
  const sig = d.signals || {};
  const mem = d.memoria || {};

  let html = `<div class="live-head"><div><b>${esc(topic)}</b> · ${esc(countryL)}${catL ? ` · <span class="tag tag--red">${esc(catL)}</span>` : ''}
      <span class="live-when">· actualizado ${esc(when)}</span></div>
      <span>${mem.corridas > 1 ? `<span class="mem-pill">🧠 ${mem.corridas} análisis · ${mem.temasAcumulados} temas recordados</span>` : ''} ${sourcePill(a.source)}</span></div>`;

  // Resumen
  html += `<div class="radar-summary">${esc(a.resumen || '')}</div>`;

  // Acción rápida
  if (a.accion_rapida) html += `<div class="radar-action"><b>⚡ Acción para hoy</b><p>${esc(a.accion_rapida)}</p></div>`;

  // Temas en tendencia
  if ((a.temas || []).length) {
    html += '<h3 class="live-h3">🔥 Temas en tendencia</h3><div class="radar-grid">';
    html += a.temas.map(t => `
      <div class="radar-card">
        <div class="radar-card__t">${esc(t.tema || '')}</div>
        ${t.por_que ? `<div class="kv"><b>Por qué</b><p>${esc(t.por_que)}</p></div>` : ''}
        ${t.angulo_sugerido ? `<div class="kv"><b>Ángulo sugerido</b><p>${esc(t.angulo_sugerido)}</p></div>` : ''}
      </div>`).join('');
    html += '</div>';
  }

  // Estructuras + hashtags
  if ((a.estructuras_ganadoras || []).length || (a.hashtags_sugeridos || []).length) {
    html += '<div class="radar-two">';
    if ((a.estructuras_ganadoras || []).length) {
      html += `<div class="radar-box"><h4>Estructuras que funcionan</h4><ul>${a.estructuras_ganadoras.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>`;
    }
    if ((a.hashtags_sugeridos || []).length) {
      html += `<div class="radar-box"><h4>Hashtags sugeridos</h4><div class="card__tags">${a.hashtags_sugeridos.map(h => `<span class="tag tag--red">${esc(h)}</span>`).join('')}</div></div>`;
    }
    html += '</div>';
  }

  // Ganchos listos para usar
  if ((a.ganchos || []).length) {
    html += `<div class="radar-box" style="margin-bottom:1.2rem"><h4>Ganchos listos${catL ? ` · tono ${esc(catL)}` : ''}</h4><ul>${a.ganchos.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
  }

  // Fuentes en vivo
  html += '<h3 class="live-h3">📡 Fuentes analizadas (links reales)</h3>';

  if ((sig.trends || []).length) {
    html += '<div class="src-label">Google Trends — búsquedas en ascenso</div><div class="hash-reco">';
    html += sig.trends.slice(0, 12).map(t => `<a class="tag tag--platform" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(t.term)}">${esc(t.term)}${t.traffic ? ' · ' + esc(t.traffic) : ''}</a>`).join('') + '</div>';
  }

  if ((sig.news || []).length) {
    html += '<div class="src-label">Google News — contenido reciente publicado</div><div class="reddit-list">';
    html += sig.news.slice(0, 8).map(r => `
      <a class="reddit-item" href="${esc(r.url)}" target="_blank" rel="noopener">
        <span class="reddit-t">${esc(r.title)}</span>
        <span class="reddit-sub">${esc(r.source || '')}</span>
      </a>`).join('') + '</div>';
  }

  // Feeds en vivo de las plataformas (sin API, links directos)
  html += '<div class="src-label">Ver este tema en vivo en cada plataforma</div><div class="link-row">';
  html += (d.links || []).map(l => `
      <a class="link-btn plat-${l.platform}" href="${esc(l.url)}" target="_blank" rel="noopener">
        <b>${PLATFORM_LABEL[l.platform]}</b><span>${esc(l.label)} ↗</span></a>`).join('') + '</div>';

  if (!d.aiEnabled) {
    html += `<div class="note-card">Estás en <b>modo demo</b>: las fuentes son reales, pero el análisis es una síntesis simple.
      Agrega <code>ANTHROPIC_API_KEY</code> en <code>.env</code> para que la IA cruce las señales, filtre el ruido y escriba en el tono elegido.</div>`;
  }

  out.innerHTML = html;
}

/* ---------------- Ideas ---------------- */
$('#iGenerate').addEventListener('click', async () => {
  const out = $('#ideasOut');
  const btn = $('#iGenerate');
  const topic = $('#iTopic').value.trim();
  if (!topic) { out.innerHTML = '<div class="empty">Escribe cualquier palabra o tema primero.</div>'; $('#iTopic').focus(); return; }
  loadingBtn(btn, 'Generando…');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Leyendo tendencias y creando ideas…</div>';
  const { data } = await api('/api/ideas', { method: 'POST', body: {
    topic, platform: $('#iPlatform').value, country: $('#iCountry').value,
    category: $('#iCategory').value, count: $('#iCount').value
  }});
  resetBtn(btn, 'Generar ideas');
  const ideas = data.ideas || [];
  if (!ideas.length) { out.innerHTML = '<div class="empty">No se pudieron generar ideas. Inténtalo de nuevo.</div>'; return; }
  out.innerHTML = trendHeader(data) + ideas.map((it, i) => `
    <div class="result-card">
      <h3>💡 ${esc(it.titulo || 'Idea ' + (i + 1))} ${sourcePill(data.source)}</h3>
      ${it.tendencia_usada ? `<div class="kv"><b>Tendencia aprovechada</b><p>${esc(it.tendencia_usada)}</p></div>` : ''}
      ${kv('Hook', it.hook)}
      ${kv('Estructura', it.estructura)}
      ${kv('Formato', it.formato)}
      ${kv('Por qué funciona', it.por_que_funciona)}
      ${kv('CTA', it.cta)}
    </div>
  `).join('');
});

/* ---------------- Contexto de marca (captions independientes por cliente) ---------------- */
function initCaptionContext() {
  const sel = $('#cMarca'); if (!sel || sel.dataset.bound) return; sel.dataset.bound = '1';
  sel.addEventListener('change', async () => {
    const marca = sel.value;
    const tag = $('#cCtxTag');
    if (!marca) { $('#cxTono').value = $('#cxPublico').value = $('#cxNotas').value = ''; tag.textContent = ''; return; }
    const { data } = await api('/api/marca/contexto?marca=' + encodeURIComponent(marca));
    $('#cxTono').value = data.tono || ''; $('#cxPublico').value = data.publico || ''; $('#cxNotas').value = data.notas || '';
    tag.textContent = (data.tono || data.publico || data.notas) ? '· cargado' : '· sin definir';
    if (data.tono || data.publico || data.notas) $('#cCtxBox').open = true;
  });
  $('#cxSave').addEventListener('click', async (e) => {
    e.preventDefault();
    const marca = sel.value;
    if (!marca) { alert('Elige una marca primero.'); return; }
    await api('/api/marca/contexto', { method: 'POST', body: { marca, tono: $('#cxTono').value, publico: $('#cxPublico').value, notas: $('#cxNotas').value } });
    $('#cCtxTag').textContent = '· guardado ✓';
  });
}

/* ---------------- Captions ---------------- */
$('#cGenerate').addEventListener('click', async () => {
  const out = $('#captionsOut');
  const btn = $('#cGenerate');
  const topic = $('#cTopic').value.trim();
  if (!topic) { out.innerHTML = '<div class="empty">Escribe el tema del contenido primero.</div>'; return; }
  loadingBtn(btn, 'Generando…');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Leyendo tendencias del tema y escribiendo captions…</div>';
  const { data } = await api('/api/captions', { method: 'POST', body: {
    topic, platform: $('#cPlatform').value, country: $('#cCountry').value,
    category: $('#cCategory').value, objetivo: $('#cObjetivo').value,
    creativo: $('#cCreativo').value.trim(), cta: $('#cCta').value.trim(),
    marca: $('#cMarca').value,
    contexto: { tono: $('#cxTono').value.trim(), publico: $('#cxPublico').value.trim(), notas: $('#cxNotas').value.trim() }
  }});
  resetBtn(btn, 'Generar captions');
  const caps = data.captions || [];
  if (!caps.length) { out.innerHTML = '<div class="empty">No se pudieron generar captions.</div>'; return; }

  // Ficha estratégica de la plataforma.
  let head = '';
  const e = data.estrategia;
  if (e) {
    head += `<div class="result-card" style="margin-bottom:1rem">
      <h3>🎯 Estrategia aplicada · ${esc(e.plataforma)}
        ${data.categoria ? `<span class="tag tag--red">${esc(data.categoria)}</span>` : ''}
        ${data.objetivo ? `<span class="tag">${esc(data.objetivo)}</span>` : ''}</h3>
      ${kv('Corte visible', e.corte)}
      ${kv('Cómo se gana aquí', e.como_se_gana)}
      ${kv('Longitud objetivo', e.largo)}
    </div>`;
  }
  head += trendHeader(data);

  out.innerHTML = head + caps.map((c, i) => `
    <div class="result-card">
      <h3>✍️ ${esc(c.angulo || 'Caption ' + (i + 1))} ${sourcePill(data.source)} ${c.longitud ? `<span class="tag">${esc(c.longitud)}</span>` : ''}</h3>
      ${c.primera_linea ? `<div class="kv"><b>Primera línea (lo único garantizado que se lee)</b><p style="font-weight:600">${esc(c.primera_linea)}</p></div>` : ''}
      <div class="caption-text" id="cap-${i}">${esc(c.texto || '')}</div>
      <button class="btn btn--ghost btn--sm copy-btn" data-copy="cap-${i}">Copiar caption</button>
      ${(c.hashtags || []).length ? `<div class="card__tags" style="margin-top:.7rem">${c.hashtags.map(h => `<span class="tag">${esc(h)}</span>`).join('')}</div>` : ''}
      ${c.que_aporta ? `<div class="kv"><b>Qué le suma al creativo</b><p>${esc(c.que_aporta)}</p></div>` : ''}
      ${c.por_que_funciona ? `<div class="kv"><b>Por qué funciona</b><p>${esc(c.por_que_funciona)}</p></div>` : ''}
      ${c.tendencia_usada ? `<div class="kv"><b>Tendencia aprovechada</b><p>${esc(c.tendencia_usada)}</p></div>` : ''}
    </div>
  `).join('');
  bindCopy();
});

/* ---------------- Hashtags ---------------- */
$('#hGenerate').addEventListener('click', async () => {
  const out = $('#hashtagsOut');
  const btn = $('#hGenerate');
  const topic = $('#hTopic').value.trim();
  if (!topic) { out.innerHTML = '<div class="empty">Escribe un tema primero.</div>'; return; }
  loadingBtn(btn, 'Analizando…');
  out.innerHTML = '<div class="loading"><div class="spinner"></div>Leyendo tendencias y analizando hashtags…</div>';
  const { data } = await api('/api/hashtags', { method: 'POST', body: {
    topic, platform: $('#hPlatform').value, country: $('#hCountry').value, category: $('#hCategory').value
  }});
  resetBtn(btn, 'Analizar hashtags');
  renderHashtags(out, data);
});

function renderHashtags(out, data) {
  if (!data || !data.grupos) { out.innerHTML = '<div class="empty">No se pudo analizar. Inténtalo de nuevo.</div>'; return; }
  const g = data.grupos;
  const col = (title, items) => `
    <div class="hash-col">
      <h4>${title}</h4>
      ${(items || []).map(it => `
        <div class="hash-item">
          <div><div class="tagname">${esc(it.tag)}</div><div class="note">${esc(it.nota || '')}</div></div>
          <span class="badge-eng eng-${alcanceClass(it.alcance)}">${esc(it.alcance || '')}</span>
        </div>`).join('')}
    </div>`;
  const reco = (data.recomendado || []).join(' ');
  out.innerHTML = trendHeader(data) + `
    <div class="result-card">
      <h3>#️⃣ Estrategia ${sourcePill(data.source)} ${data.categoria ? `<span class="tag tag--red">${esc(data.categoria)}</span>` : ''}</h3>
      <div class="hash-strategy">${esc(data.estrategia || '')}</div>
      <div class="hash-groups">
        ${col('Amplios', g.amplios)}
        ${col('De nicho', g.nicho)}
        ${col('Long-tail', g.longtail)}
        ${(g.momento || []).length ? col('🔥 De momento', g.momento) : ''}
      </div>
      <div class="kv"><b>Set recomendado para copiar</b>
        <div class="caption-text" id="reco-set">${esc(reco)}</div>
        <button class="btn btn--ghost btn--sm copy-btn" data-copy="reco-set">Copiar set</button>
      </div>
    </div>`;
  bindCopy();
}
function alcanceClass(a) { return a === 'alto' ? 'explosivo' : a === 'medio' ? 'alto' : 'medio'; }

/* ---------------- Helpers UI ---------------- */
// Encabezado con las tendencias en vivo que alimentaron el resultado.
function trendHeader(data) {
  if (!(data.tendencias || []).length) return '';
  return `<div class="result-card" style="margin-bottom:1rem">
    <h3>📡 Tendencias usadas ${data.categoria ? `<span class="tag tag--red">${esc(data.categoria)}</span>` : ''}</h3>
    <div class="reddit-list">${data.tendencias.map(t => `
      <a class="reddit-item" href="${esc(t.url)}" target="_blank" rel="noopener">
        <span class="reddit-t">${esc(t.title)}</span>
        <span class="reddit-sub">${esc(t.source || '')}</span></a>`).join('')}</div></div>`;
}
function kv(label, val) { return val ? `<div class="kv"><b>${esc(label)}</b><p>${esc(val)}</p></div>` : ''; }
function sourcePill(src) {
  return src === 'ia'
    ? '<span class="source-pill source-ia">IA</span>'
    : '<span class="source-pill source-demo">demo</span>';
}
function bindCopy() {
  $$('.copy-btn').forEach(b => b.addEventListener('click', () => {
    const text = $('#' + b.dataset.copy).innerText;
    navigator.clipboard.writeText(text).then(() => {
      const prev = b.textContent; b.textContent = '¡Copiado!';
      setTimeout(() => b.textContent = prev, 1200);
    });
  }));
}
function loadingBtn(btn, txt) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = txt; }
function resetBtn(btn, txt) { btn.disabled = false; btn.textContent = txt; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function show(sel) { $(sel).classList.remove('hidden'); }
function hide(sel) { $(sel).classList.add('hidden'); }

/* ---------------- Init ---------------- */
checkSession();
