'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const NODE_W = 218;
const NODE_H = 86;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3.2;

const KIND_LABEL = { root: 'ROOT', dir: 'DIR', file: 'FILE', branch: 'BRANCH' };
const KIND_ICON = { root: '★', dir: '//', file: '•', branch: '+' };
const LAYOUTS = [
  { id: 'tree', name: 'Дерево' },
  { id: 'layers', name: 'Слои' }
];
const THEME_ALIAS = { ember: 'red', abyss: 'blue', snow: 'mono' };
const MARKS = ['★', '⚑', '⚠', '✔', '●', '◆', '✚', '✦', '⚡', '🔥', '💡', '🚀', '🧩', '🧠', '⏳', '🎯'];

const state = {
  projects: [],
  activeId: null,
  theme: 'red',
  selectedId: null,
  view: { x: 0, y: 0, k: 1 }
};

const nodeEls = new Map();
const edgeEls = new Map();

let saveTimer = null;


const history = { stack: [], index: -1, limit: 80 };

function historySnapshot() {
  return JSON.stringify({ projects: state.projects, activeId: state.activeId });
}

function historyKey(snap) {
  try {
    const data = JSON.parse(snap);
    data.projects = (data.projects || []).map((p) => ({ ...p, updatedAt: 0 }));
    return JSON.stringify(data);
  } catch {
    return snap;
  }
}

function pushHistory() {
  const snap = historySnapshot();
  if (history.index >= 0 && historyKey(history.stack[history.index]) === historyKey(snap)) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(snap);
  if (history.stack.length > history.limit) history.stack.shift();
  history.index = history.stack.length - 1;
  updateHistoryButtons();
}

function applyHistory(snap) {
  const data = JSON.parse(snap);
  state.projects = data.projects;
  state.activeId = data.activeId;
  if (state.selectedId && !getNode(state.selectedId)) state.selectedId = null;
  renderAll();
  save();
  writeSchema();
  updateHistoryButtons();
}

function undo() {
  if (history.index <= 0) {
    toast('Отменять нечего');
    return;
  }
  history.index -= 1;
  applyHistory(history.stack[history.index]);
  toast('Отменено');
}

function redo() {
  if (history.index >= history.stack.length - 1) {
    toast('Повторять нечего');
    return;
  }
  history.index += 1;
  applyHistory(history.stack[history.index]);
  toast('Возвращено');
}

function updateHistoryButtons() {
  const u = $('#btn-undo');
  const r = $('#btn-redo');
  if (u) u.disabled = history.index <= 0;
  if (r) r.disabled = history.index >= history.stack.length - 1;
}


const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const uid = (p = 'n') =>
  p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = n / Math.pow(1024, i);
  return (val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)) + ' ' + u[i];
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  return Math.floor(s / 86400) + ' дн назад';
}

const project = () => state.projects.find((p) => p.id === state.activeId) || null;
const getNode = (id) => {
  const p = project();
  return p ? p.nodes.find((n) => n.id === id) || null : null;
};
const childrenOf = (id) => {
  const p = project();
  return p ? p.nodes.filter((n) => n.parentId === id) : [];
};

function toast(msg) {
  const wrap = $('#toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 2300);
}


function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveStore({
      projects: state.projects,
      activeId: state.activeId,
      theme: state.theme,
      savedAt: Date.now()
    }).catch(() => {});
  }, 350);
  writeSchema();
}


function projectSchema(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));

  const build = (id) => {
    const n = byId.get(id);
    if (!n) return null;
    const children = p.nodes
      .filter((c) => c.parentId === id)
      .map((c) => build(c.id))
      .filter(Boolean);
    return {
      name: n.title,
      type: n.kind,
      path: n.path || null,
      note: n.note || '',
      marks: Array.isArray(n.marks) ? n.marks : [],
      tags: n.tags || [],
      size: n.size || 0,
      files: n.fileCount || 0,
      folders: n.dirCount || 0,
      position: { x: Math.round(n.x), y: Math.round(n.y) },
      children
    };
  };

  return {
    app: 'InfiniteWeb',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: p.name,
    layout: p.layout || 'tree',
    stats: projectStats(p),
    tree: build(p.rootId)
  };
}

let schemaTimer = null;
function writeSchema() {
  clearTimeout(schemaTimer);
  schemaTimer = setTimeout(async () => {
    const p = project();
    if (!p) return;
    try {
      await api.writeSchema(p.name, projectSchema(p));
    } catch {
    }
  }, 600);
}


function showModal({ title, body = '', buttons = [] }) {
  const overlay = $('#modal-overlay');
  const bodyEl = $('#modal-body');
  const footEl = $('#modal-foot');

  $('#modal-title').textContent = title;
  bodyEl.innerHTML = body;
  footEl.innerHTML = '';

  let settled = false;
  const close = (val) => {
    if (settled) return;
    settled = true;
    overlay.hidden = true;
    document.removeEventListener('keydown', onKey);
    resolve(val);
  };
  let resolve;
  const promise = new Promise((r) => (resolve = r));

  const onKey = (e) => {
    if (e.key === 'Escape') close(null);
  };
  document.addEventListener('keydown', onKey);

  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || 'btn-ghost');
    btn.textContent = b.label;
    btn.addEventListener('click', async () => {
      if (b.onClick) {
        const val = await b.onClick(bodyEl);
        if (val === undefined) return;
        close(val);
      } else {
        close(null);
      }
    });
    footEl.appendChild(btn);
  });

  overlay.hidden = false;
  overlay.onclick = (e) => {
    if (e.target === overlay) close(null);
  };
  $('#modal-close').onclick = () => close(null);

  const first = bodyEl.querySelector('input, textarea');
  if (first) setTimeout(() => { first.focus(); first.select(); }, 60);

  return promise;
}

function confirmDialog(title, html, okLabel = 'Удалить') {
  return showModal({
    title,
    body: `<p>${html}</p>`,
    buttons: [
      { label: 'Отмена', cls: 'btn-ghost' },
      {
        label: okLabel,
        cls: 'btn-primary',
        onClick: () => true
      }
    ]
  }).then((v) => v === true);
}

function promptText(title, label, value = '', placeholder = '') {
  return showModal({
    title,
    body: `
      <div class="field">
        <label>${esc(label)}</label>
        <input id="pm-input" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}">
      </div>`,
    buttons: [
      { label: 'Отмена', cls: 'btn-ghost' },
      {
        label: 'Сохранить',
        cls: 'btn-primary',
        onClick: (el) => {
          const v = el.querySelector('#pm-input').value.trim();
          return v || null;
        }
      }
    ]
  });
}


function makeNode(data) {
  return {
    id: uid(),
    parentId: null,
    title: 'Новая ветка',
    kind: 'branch',
    desc: '',
    tags: [],
    note: '',
    marks: [],
    path: null,
    size: 0,
    fileCount: 0,
    dirCount: 0,
    ext: '',
    x: 0,
    y: 0,
    createdAt: Date.now(),
    ...data
  };
}

function makeProject(name) {
  const root = makeNode({
    title: name,
    kind: 'root',
    desc: 'Корень проекта',
    tags: ['root']
  });
  return {
    id: uid('p'),
    name,
    rootId: root.id,
    nodes: [root],
    layout: 'tree',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function createProject() {
  const name = await promptText('Новый проект', 'Название проекта', '', 'Например: StarsItems');
  if (!name) return;
  const p = makeProject(name);
  state.projects.push(p);
  openProject(p.id, true);
  save();
  pushHistory();
  toast('Проект «' + name + '» создан');
}

async function renameProject() {
  const p = project();
  if (!p) return;
  const name = await promptText('Переименовать проект', 'Название проекта', p.name);
  if (!name) return;
  p.name = name;
  const root = p.nodes.find((n) => n.id === p.rootId);
  if (root) root.title = name;
  renderAll();
  save();
  pushHistory();
}

async function deleteProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmDialog(
    'Удалить проект?',
    `Точно удалить проект <b>${esc(p.name)}</b>? Вся структура веток будет стёрта безвозвратно.`,
    'Удалить проект'
  );
  if (!ok) return;
  state.projects = state.projects.filter((x) => x.id !== id);
  if (state.activeId === id) {
    state.activeId = state.projects.length ? state.projects[state.projects.length - 1].id : null;
    state.selectedId = null;
  }
  renderAll();
  save();
  pushHistory();
  toast('Проект удалён');
}

function openProject(id, isNew = false) {
  if (state.activeId === id && !isNew) return;
  state.activeId = id;
  state.selectedId = null;
  renderAll({ animate: true });
  setTimeout(() => fitView(), 120);
  save();
}


function projectStats(p) {
  let files = 0, dirs = 0, branches = 0, size = 0;
  for (const n of p.nodes) {
    if (n.kind === 'file') { files++; size += n.size || 0; }
    else if (n.kind === 'dir') dirs++;
    else if (n.kind === 'branch') branches++;
  }
  return { files, dirs, branches, size, total: p.nodes.length };
}

function renderSidebar() {
  const list = $('#project-list');
  list.innerHTML = '';
  const q = $('#project-search').value.trim().toLowerCase();

  const items = state.projects.filter(
    (p) => !q || p.name.toLowerCase().includes(q)
  );

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'proj-item';
    li.style.cursor = 'default';
    li.innerHTML = `<div class="proj-meta"><div class="proj-name" style="color:var(--muted)">${
      state.projects.length ? 'Ничего не найдено' : 'Проектов пока нет'
    }</div><div class="proj-sub">нажмите + чтобы создать</div></div>`;
    list.appendChild(li);
    return;
  }

  items.forEach((p, idx) => {
    const st = projectStats(p);
    const li = document.createElement('li');
    li.className = 'proj-item' + (p.id === state.activeId ? ' active' : '');
    li.style.animationDelay = idx * 45 + 'ms';
    li.innerHTML = `
      <div class="proj-avatar"><img src="assets/logo.png" alt=""></div>
      <div class="proj-meta">
        <div class="proj-name">${esc(p.name)}</div>
        <div class="proj-sub">${st.total} узлов · ${st.files} файлов</div>
      </div>
      <button class="proj-x" title="Удалить проект">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </button>`;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.proj-x')) return;
      openProject(p.id);
    });
    li.addEventListener('dblclick', (e) => {
      if (e.target.closest('.proj-x')) return;
      state.activeId = p.id;
      renderSidebar();
      renameProject();
    });
    $('.proj-x', li).addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProject(p.id);
    });

    list.appendChild(li);
  });
}


function nodeDepth(p, node) {
  let d = 0;
  let cur = node;
  while (cur && cur.parentId) {
    const parent = p.nodes.find((n) => n.id === cur.parentId);
    if (!parent) break;
    cur = parent;
    d++;
  }
  return d;
}

function edgePath(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const rx = NODE_W / 2;
  const ry = NODE_H / 2;
  const t = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);

  const x1 = a.x + ux * t;
  const y1 = a.y + uy * t;
  const x2 = b.x - ux * t;
  const y2 = b.y - uy * t;

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function nodeHtml(n) {
  const stat = [];
  if (n.kind === 'file') {
    stat.push(bytes(n.size));
    if (n.ext) stat.push('.' + n.ext);
  } else {
    if (n.fileCount) stat.push(`${n.fileCount} файлов`);
    if (n.dirCount) stat.push(`${n.dirCount} папок`);
    if (n.size) stat.push(bytes(n.size));
  }
  const pathText = n.path || (n.kind === 'root' ? '/' : '—');
  const marks = Array.isArray(n.marks) ? n.marks : [];
  const mark = marks[0] || ''; 
  const icon = mark || (n.kind === 'file' ? (n.ext || '•').slice(0, 3).toUpperCase() : KIND_ICON[n.kind] || '•');

  return `
    <div class="node-card">
      <div class="node-top">
        <div class="node-ico${mark ? ' has-mark' : ''}"${mark ? ` title="Метка: ${esc(mark)}"` : ''}>${esc(icon)}</div>
        <div class="node-name" title="${esc(n.title)}">${esc(n.title)}</div>
        <div class="node-kind">${KIND_LABEL[n.kind] || 'NODE'}</div>
      </div>
      ${n.path ? `<div class="node-path" title="${esc(n.path)}">${esc(pathText)}</div>` : ''}
      ${n.desc ? `<div class="node-desc">${esc(n.desc)}</div>` : ''}
      ${n.tags && n.tags.length ? `<div class="node-tags">${n.tags.map((t) => `<span class="node-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${stat.length ? `<div class="node-stat">${stat.map((s) => `<span><b>${esc(s)}</b></span>`).join('<span>·</span>')}</div>` : ''}
    </div>`;
}

function renderCanvas(opts = {}) {
  const p = project();
  const nodesEl = $('#nodes');
  const edgesEl = $('#edges');
  nodesEl.innerHTML = '';
  edgesEl.innerHTML = '';
  nodeEls.clear();
  edgeEls.clear();

  if (!p) {
    $('#empty-state').classList.remove('hidden');
    return;
  }
  const noProjects = state.projects.length === 0;
  $('#empty-state').classList.toggle('hidden', !noProjects);

  const animateIds = opts.animateIds || null;

  for (const n of p.nodes) {
    if (!n.parentId) continue;
    const parent = p.nodes.find((x) => x.id === n.parentId);
    if (!parent) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(parent, n));
    edgesEl.appendChild(path);
    edgeEls.set(n.id, path);
  }

  for (const n of p.nodes) {
    const el = document.createElement('div');
    el.className = 'node' + (n.kind === 'root' ? ' root' : '');
    el.dataset.id = n.id;
    el.style.setProperty('--kind-color', `var(--kind-${n.kind})`);
    el.style.transform = `translate(${n.x - NODE_W / 2}px, ${n.y - NODE_H / 2}px)`;
    el.innerHTML = nodeHtml(n);
    nodesEl.appendChild(el);
    nodeEls.set(n.id, el);
    bindNode(el, n);
  }

  const doAnim = opts.animate || animateIds;
  if (doAnim) {
    requestAnimationFrame(() => {
      for (const n of p.nodes) {
        const el = nodeEls.get(n.id);
        if (!el) continue;
        if (animateIds && !animateIds.has(n.id)) continue;
        const d = nodeDepth(p, n) * 0.075;
        el.style.setProperty('--d', d + 's');
        el.classList.add('in');
      }
      for (const n of p.nodes) {
        if (!n.parentId) continue;
        if (animateIds && !animateIds.has(n.id)) continue;
        const path = edgeEls.get(n.id);
        if (!path) continue;
        const len = path.getTotalLength ? path.getTotalLength() : 400;
        const d = nodeDepth(p, n) * 0.075;
        path.style.setProperty('--len', len + 1);
        path.style.setProperty('--d', d + 's');
        path.classList.add('draw');
      }
    });

    setTimeout(() => {
      nodeEls.forEach((el) => el.classList.remove('in'));
      edgeEls.forEach((path) => path.classList.remove('draw'));
    }, 1600);
  }

  highlightEdges();

  const selEl = state.selectedId ? nodeEls.get(state.selectedId) : null;
  if (selEl) selEl.classList.add('sel');
}

function updateNodeDom(n) {
  const el = nodeEls.get(n.id);
  if (el) el.style.transform = `translate(${n.x - NODE_W / 2}px, ${n.y - NODE_H / 2}px)`;
  const p = project();
  if (!p) return;
  const path = edgeEls.get(n.id);
  if (path && n.parentId) {
    const parent = p.nodes.find((x) => x.id === n.parentId);
    if (parent) path.setAttribute('d', edgePath(parent, n));
  }
  for (const c of childrenOf(n.id)) {
    const cp = edgeEls.get(c.id);
    if (cp) cp.setAttribute('d', edgePath(n, c));
  }
}

function highlightEdges() {
  const p = project();
  if (!p) return;
  const sel = state.selectedId;
  edgeEls.forEach((path, childId) => {
    path.classList.remove('hi', 'dim');
    if (!sel) return;
    const child = p.nodes.find((n) => n.id === childId);
    if (!child) return;
    const isChild = child.parentId === sel;
    const isParent = child.id === sel;
    if (isChild || isParent) path.classList.add('hi');
  });
}


function select(id) {
  state.selectedId = id;
  nodeEls.forEach((el, nid) => el.classList.toggle('sel', nid === id));
  highlightEdges();
  renderInspector();
  const del = $('#btn-delete');
  del.disabled = !id;
}


function layoutTree(p, mode, opts = {}) {
  if (!p || !p.nodes.length) return;
  p.layout = mode;

  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const children = (id) => p.nodes.filter((n) => n.parentId === id);
  const root = byId.get(p.rootId) || p.nodes[0];

  const COL = 340;   
  const ROW = 116;   
  const LEV = 210;   

  const assign = (node, depth, slot) => {
    if (!node) return;
    if (mode === 'layers') {
      node.x = slot * COL;
      node.y = depth * LEV;
    } else {
      node.x = depth * COL;
      node.y = slot * ROW;
    }
  };

  const place = (id, depth, slotStart) => {
    const node = byId.get(id);
    const ch = children(id);

    if (!ch.length) {
      assign(node, depth, slotStart);
      return { start: slotStart, end: slotStart + 1 };
    }

    let cursor = slotStart;
    let first = null;
    let last = null;
    for (const c of ch) {
      const r = place(c.id, depth + 1, cursor);
      cursor = r.end;
      if (!first) first = r;
      last = r;
    }
    assign(node, depth, (first.start + last.end) / 2);
    return { start: first.start, end: last.end };
  };

  place(root.id, 0, 0);

  if (!opts.silent) {
    renderCanvas({ animateIds: new Set(p.nodes.map((n) => n.id)) });
    setTimeout(() => fitView(), 80);
  }
}

function cycleLayout() {
  const p = project();
  if (!p) return;
  const idx = LAYOUTS.findIndex((l) => l.id === (p.layout || 'tree'));
  const next = LAYOUTS[(idx + 1) % LAYOUTS.length];
  layoutTree(p, next.id);
  save();
  toast('Расположение: ' + next.name);
}


function applyView() {
  const world = $('#world');
  world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.k})`;
  $('#zoom-label').textContent = Math.round(state.view.k * 100) + '%';
}

function zoomAt(factor, cx, cy) {
  const canvas = $('#canvas');
  const rect = canvas.getBoundingClientRect();
  const mx = cx === undefined ? rect.width / 2 : cx;
  const my = cy === undefined ? rect.height / 2 : cy;
  const k2 = clamp(state.view.k * factor, MIN_ZOOM, MAX_ZOOM);
  state.view.x = mx - (mx - state.view.x) * (k2 / state.view.k);
  state.view.y = my - (my - state.view.y) * (k2 / state.view.k);
  state.view.k = k2;
  applyView();
}

function fitView() {
  const p = project();
  if (!p || !p.nodes.length) return;
  const canvas = $('#canvas');
  const rect = canvas.getBoundingClientRect();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of p.nodes) {
    minX = Math.min(minX, n.x - NODE_W / 2);
    minY = Math.min(minY, n.y - NODE_H / 2);
    maxX = Math.max(maxX, n.x + NODE_W / 2);
    maxY = Math.max(maxY, n.y + NODE_H / 2);
  }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const k = clamp(Math.min((rect.width - 140) / bw, (rect.height - 180) / bh), MIN_ZOOM, 1.1);
  state.view.k = k;
  state.view.x = rect.width / 2 - ((minX + maxX) / 2) * k;
  state.view.y = rect.height / 2 - ((minY + maxY) / 2) * k;
  applyView();
}

function subtreeOf(id) {
  const p = project();
  const out = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    const node = p.nodes.find((n) => n.id === cur);
    if (node) out.push(node);
    childrenOf(cur).forEach((c) => stack.push(c.id));
  }
  return out;
}

function extStats(files) {
  const map = new Map();
  for (const f of files) {
    const key = f.ext || '—';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderInspector() {
  const body = $('#insp-body');
  const title = $('#insp-title');
  const badge = $('#insp-badge');
  const p = project();

  if (!p) {
    title.textContent = 'Нет проекта';
    badge.textContent = 'EMPTY';
    body.innerHTML = `<div class="insp-empty">Создайте проект слева, чтобы начать строить структуру веток.</div>`;
    return;
  }

  const node = state.selectedId ? p.nodes.find((n) => n.id === state.selectedId) : null;

  if (!node) {
    const st = projectStats(p);
    title.textContent = 'Обзор проекта';
    badge.textContent = 'PROJECT';
    body.innerHTML = `
      <div class="insp-section">
        <div class="insp-label">Название</div>
        <div style="font-family:var(--font-disp);font-size:14px;font-weight:700">${esc(p.name)}</div>
      </div>
      <div class="insp-section">
        <div class="insp-label">Метрики</div>
        <div class="kv"><span>Всего узлов</span><b>${st.total}</b></div>
        <div class="kv"><span>Веток</span><b>${st.branches}</b></div>
        <div class="kv"><span>Папок</span><b>${st.dirs}</b></div>
        <div class="kv"><span>Файлов</span><b>${st.files}</b></div>
        <div class="kv"><span>Общий размер</span><b>${bytes(st.size)}</b></div>
      </div>
      <div class="insp-section">
        <div class="insp-label">Расположение</div>
        <div class="kv"><span>Режим</span><b>${esc((LAYOUTS.find((l) => l.id === p.layout) || LAYOUTS[0]).name)}</b></div>
        <div class="kv"><span>Обновлён</span><b>${timeAgo(p.updatedAt || Date.now())}</b></div>
      </div>
      <div class="insp-section">
        <div class="insp-label">Анализ</div>
        <div class="insp-empty">Выберите узел на холсте — здесь появится разбор его ветки: файлы, расширения, размер, вложенность.</div>
      </div>`;
    return;
  }

  const sub = subtreeOf(node.id);
  const files = sub.filter((n) => n.kind === 'file');
  const dirs = sub.filter((n) => n.kind === 'dir');
  const size = files.reduce((a, f) => a + (f.size || 0), 0);
  const depth = nodeDepth(p, node);
  const exts = extStats(files).slice(0, 6);
  const maxExt = exts.length ? exts[0][1] : 1;
  const biggest = [...files].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 3);

  title.textContent = node.title;
  badge.textContent = KIND_LABEL[node.kind] || 'NODE';

  body.innerHTML = `
    <div class="insp-section">
      <div class="insp-label">Ветка</div>
      <div class="kv"><span>Тип</span><b>${KIND_LABEL[node.kind]}</b></div>
      <div class="kv"><span>Вложенность</span><b>${depth}</b></div>
      <div class="kv"><span>Потомков</span><b>${Math.max(0, sub.length - 1)}</b></div>
      ${node.tags && node.tags.length ? `<div class="node-tags" style="margin-top:10px">${node.tags.map((t) => `<span class="node-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>

    ${node.desc ? `<div class="insp-section"><div class="insp-label">Описание</div><div class="insp-path" style="font-family:var(--font-sans);font-size:12px">${esc(node.desc)}</div></div>` : ''}

    ${(node.marks && node.marks.length) ? `
    <div class="insp-section">
      <div class="insp-label">Метка</div>
      <div class="insp-marks">${node.marks.map((m) => `<span class="insp-mark">${esc(m)}</span>`).join('')}</div>
    </div>` : ''}

    ${(node.note || '').trim() ? `
    <div class="insp-section">
      <div class="insp-label">Заметка</div>
      <div class="insp-text">${esc(node.note)}</div>
    </div>` : ''}

    <div class="insp-section">
      <div class="insp-label">Анализ ветки</div>
      <div class="kv"><span>Файлов</span><b>${files.length}</b></div>
      <div class="kv"><span>Папок</span><b>${dirs.length}</b></div>
      <div class="kv"><span>Размер</span><b>${bytes(size)}</b></div>
    </div>

    ${exts.length ? `
    <div class="insp-section">
      <div class="insp-label">Расширения</div>
      ${exts.map(([e, c]) => `
        <div class="bar-row">
          <div class="bar-ext">${esc(e)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((c / maxExt) * 100)}%"></div></div>
          <div class="bar-num">${c}</div>
        </div>`).join('')}
    </div>` : ''}

    ${biggest.length ? `
    <div class="insp-section">
      <div class="insp-label">Крупнейшие файлы</div>
      ${biggest.map((f) => `<div class="kv"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.title)}</span><b>${bytes(f.size)}</b></div>`).join('')}
    </div>` : ''}

    ${node.path ? `
    <div class="insp-section">
      <div class="insp-label">Путь</div>
      <div class="insp-path">${esc(node.path)}</div>
    </div>` : ''}

    <div class="insp-actions">
      ${node.path ? `<button class="insp-act" id="ins-open">Открыть в проводнике</button>` : ''}
      <button class="insp-act" id="ins-edit">Изменить</button>
      <button class="insp-act" id="ins-child">+ Ветка</button>
      ${node.id !== p.rootId ? `<button class="insp-act danger" id="ins-del">Удалить</button>` : ''}
    </div>`;

  const openBtn = $('#ins-open');
  if (openBtn) openBtn.addEventListener('click', () => api.showItem(node.path));
  $('#ins-edit').addEventListener('click', () => editNode(node.id));
  $('#ins-child').addEventListener('click', () => addBranch(node.id));
  const delBtn = $('#ins-del');
  if (delBtn) delBtn.addEventListener('click', () => deleteNode(node.id));
}


async function addBranch(parentId) {
  const p = project();
  if (!p) {
    await createProject();
    return;
  }
  const parent = parentId ? getNode(parentId) : getNode(p.rootId);
  const anchor = parent || getNode(p.rootId);

  const node = makeNode({
    parentId: anchor.id,
    title: 'Новая ветка',
    kind: 'branch',
    desc: '',
    tags: []
  });
  node.x = anchor.x + 300;
  node.y = anchor.y + 120;

  p.nodes.push(node);
  p.updatedAt = Date.now();
  select(node.id);
  renderCanvas({ animateIds: new Set([node.id]) });
  save();
  toast('Ветка добавлена — задайте имя');

  await editNode(node.id, { noHistory: true, isNew: true });
  pushHistory();
}

async function editNode(id, opts = {}) {
  const p = project();
  const node = p && p.nodes.find((n) => n.id === id);
  if (!node) return;
  const marks = Array.isArray(node.marks) ? node.marks.slice() : [];
  const isNew = !!opts.isNew;

  const modalPromise = showModal({
    title: isNew ? 'Новая ветка' : 'Редактирование ветки',
    body: `
      <div class="field">
        <label>Название</label>
        <input id="ed-title" type="text" value="${esc(node.title)}" placeholder="Название ветки">
      </div>
      <div class="field">
        <label>Описание</label>
        <textarea id="ed-desc" placeholder="Короткое описание ветки">${esc(node.desc || '')}</textarea>
      </div>
      <div class="field">
        <label>Метка — значок слева от названия</label>
        <div class="mark-palette" id="ed-marks">
          ${MARKS.map(
            (m) => `<button type="button" class="mark-btn ${marks[0] === m ? 'on' : ''}" data-mark="${esc(m)}" title="Выбрать метку ${esc(m)}">${esc(m)}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field">
        <label>Заметка</label>
        <input id="ed-note" type="text" value="${esc(node.note || '')}" placeholder="например: проверить сборку, TODO, v2 — готово">
      </div>
      <div class="field">
        <label>Теги (через запятую)</label>
        <input id="ed-tags" type="text" value="${esc((node.tags || []).join(', '))}" placeholder="api, ядро, ui">
      </div>`,
    buttons: [
      { label: 'Отмена', cls: 'btn-ghost' },
      {
        label: isNew ? 'Создать ветку' : 'Сохранить',
        cls: 'btn-primary',
        onClick: (el) => {
          const title = el.querySelector('#ed-title').value.trim();
          if (!title) return undefined;

          const picked = [...el.querySelectorAll('#ed-marks .mark-btn.on')].map((b) => b.dataset.mark).slice(0, 1);
          const desc = el.querySelector('#ed-desc').value.trim();
          const note = el.querySelector('#ed-note').value.trim();
          const tags = el.querySelector('#ed-tags')
            .value.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 8);

          const changed =
            node.title !== title ||
            node.desc !== desc ||
            node.note !== note ||
            JSON.stringify(node.marks || []) !== JSON.stringify(picked) ||
            JSON.stringify(node.tags || []) !== JSON.stringify(tags);

          node.title = title;
          node.desc = desc;
          node.note = note;
          node.marks = picked;
          node.tags = tags;
          p.updatedAt = Date.now();
          renderCanvas();
          renderInspector();
          save();
          if (changed && !opts.noHistory) pushHistory();
          writeSchema();
          return true;
        }
      }
    ]
  });

  const palette = $('#ed-marks');
  if (palette) {
    palette.addEventListener('click', (e) => {
      const btn = e.target.closest('.mark-btn');
      if (!btn) return;
      const wasOn = btn.classList.contains('on');
      palette.querySelectorAll('.mark-btn.on').forEach((b) => b.classList.remove('on'));
      if (!wasOn) btn.classList.add('on');
    });
  }

  return modalPromise;
}

async function deleteNode(id) {
  const p = project();
  if (!p) return;
  const node = p.nodes.find((n) => n.id === id);
  if (!node) return;
  if (node.id === p.rootId) {
    toast('Корень проекта удалить нельзя');
    return;
  }

  const sub = subtreeOf(node.id);
  const extra = sub.length - 1;
  const ok = await confirmDialog(
    'Удалить ветку?',
    `Точно хотите удалить ветку <b>${esc(node.title)}</b>?${
      extra ? ` Вместе с ней исчезнет <b>${extra}</b> дочерних узлов.` : ''
    } Действие необратимо.`
  );
  if (!ok) return;

  const ids = new Set(sub.map((n) => n.id));
  p.nodes = p.nodes.filter((n) => !ids.has(n.id));
  p.updatedAt = Date.now();
  if (state.selectedId && ids.has(state.selectedId)) state.selectedId = null;
  select(null);
  renderCanvas();
  renderSidebar();
  save();
  pushHistory();
  toast('Ветка «' + node.title + '» удалена');
}


function nodesFromScan(tree, parentId, p) {
  const node = makeNode({
    parentId,
    title: tree.name,
    kind: 'dir',
    path: tree.path,
    desc: '',
    tags: []
  });
  p.nodes.push(node);

  let size = 0;
  let files = 0;
  let dirCount = 0;
  const exts = [];

  for (const child of tree.children || []) {
    if (child.type === 'dir') {
      dirCount++;
      const childNode = nodesFromScan(child, node.id, p);
      size += childNode.__size || 0;
      files += childNode.__files || 0;
      dirCount += childNode.__dirs || 0;
    } else {
      const f = makeNode({
        parentId: node.id,
        title: child.name,
        kind: 'file',
        path: child.path,
        size: child.size,
        ext: child.ext,
        tags: []
      });
      p.nodes.push(f);
      size += child.size || 0;
      files++;
      if (child.ext) exts.push(child.ext);
    }
  }

  node.size = size;
  node.fileCount = files;
  node.dirCount = dirCount;
  node.__size = size;
  node.__files = files;
  node.__dirs = dirCount;
  return node;
}

function chooseImportTarget() {
  return new Promise((resolve) => {
    const overlay = $('#modal-overlay');
    const bodyEl = $('#modal-body');
    const footEl = $('#modal-foot');

    $('#modal-title').textContent = 'Импорт структуры';
    bodyEl.innerHTML = `
      <p>Выберите папку — приложение проанализирует её структуру и построит карту веток.</p>
      <div style="height:14px"></div>
      <button class="choice" id="imp-current">
        <span class="choice-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2z"/></svg></span>
        <span><span class="choice-t">В текущий проект</span><br><span class="choice-d">добавит импорт к выбранной ветке</span></span>
      </button>
      <button class="choice" id="imp-new">
        <span class="choice-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>
        <span><span class="choice-t">Создать новый проект</span><br><span class="choice-d">отдельная карта импортированной папки</span></span>
      </button>`;
    footEl.innerHTML = '';

    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.textContent = 'Отмена';
    footEl.appendChild(cancel);

    const done = (v) => {
      overlay.hidden = true;
      resolve(v);
    };
    cancel.onclick = () => done(null);
    $('#imp-current').onclick = () => done('current');
    $('#imp-new').onclick = () => done('new');
    overlay.onclick = (e) => {
      if (e.target === overlay) done(null);
    };
    $('#modal-close').onclick = () => done(null);

    overlay.hidden = false;
  });
}

async function importFolder() {
  const p = project();
  const target = await chooseImportTarget();
  if (!target) return;

  const dir = await api.pickFolder();
  if (!dir) return;

  toast('Анализ структуры папки...');
  const tree = await api.scanFolder(dir);
  if (!tree) {
    toast('Не удалось прочитать папку');
    return;
  }

  let targetProject = p;
  if (target === 'new' || !targetProject) {
    targetProject = makeProject(tree.name);
    state.projects.push(targetProject);
    state.activeId = targetProject.id;
  }

  const parentId =
    target === 'current' && state.selectedId ? state.selectedId : targetProject.rootId;

  const rootNode = nodesFromScan(tree, parentId, targetProject);
  delete rootNode.__size;
  delete rootNode.__files;
  delete rootNode.__dirs;

  targetProject.updatedAt = Date.now();
  state.selectedId = rootNode.id;
  layoutTree(targetProject, targetProject.layout || 'tree', { silent: true });

  renderSidebar();
  renderCanvas({ animateIds: new Set(targetProject.nodes.map((n) => n.id)) });
  renderInspector();
  setTimeout(() => fitView(), 120);
  save();
  pushHistory();
  writeSchema();

  const cnt = targetProject.nodes.length;
  toast(`Импортировано узлов: ${cnt}${tree.truncated ? ' (обрезано)' : ''}`);
}


function bindNode(el, node) {
  const card = $('.node-card', el);

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(node.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const ox = node.x;
    const oy = node.y;
    let moved = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      node.x = ox + dx / state.view.k;
      node.y = oy + dy / state.view.k;
      updateNodeDom(node);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) {
        const p = project();
        if (p) p.updatedAt = Date.now();
        save();
        pushHistory();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  card.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    editNode(node.id);
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    select(node.id);
    showCtxMenu(e.clientX, e.clientY, nodeCtxItems(node));
  });

}


const CTX_ICONS = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V5a2 2 0 0 1 2-2h4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>'
};

function closeCtxMenu() {
  const menu = $('#ctx-menu');
  if (!menu) return;
  menu.hidden = true;
  menu.innerHTML = '';
}

function showCtxMenu(x, y, items) {
  const menu = $('#ctx-menu');
  if (!menu) return;
  menu.innerHTML = items
    .map((it, i) => {
      if (it.sep) return '<div class="ctx-sep"></div>';
      if (it.head) return `<div class="ctx-head">${esc(it.head)}</div>`;
      return `<button class="ctx-item${it.danger ? ' danger' : ''}" data-idx="${i}"${it.disabled ? ' disabled' : ''}>
        <span class="ctx-ico">${it.icon ? CTX_ICONS[it.icon] || '' : ''}</span>
        <span class="ctx-label">${esc(it.label)}</span>
        ${it.key ? `<span class="ctx-key">${esc(it.key)}</span>` : ''}
      </button>`;
    })
    .join('');

  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(6, Math.min(x, window.innerWidth - rect.width - 8));
  const top = Math.max(6, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  menu.onclick = (e) => {
    const btn = e.target.closest('.ctx-item');
    if (!btn || btn.disabled) return;
    const it = items[Number(btn.dataset.idx)];
    closeCtxMenu();
    if (it && it.action) it.action();
  };
}

function nodeCtxItems(node) {
  const p = project();
  const isRoot = p && node.id === p.rootId;
  const items = [
    { head: node.title || 'Ветка' },
    {
      label: 'Изменить…',
      key: 'F2',
      icon: 'edit',
      action: () => editNode(node.id)
    },
    {
      label: 'Добавить подветку',
      key: 'N',
      icon: 'plus',
      action: () => addBranch(node.id)
    }
  ];
  if (node.path) {
    items.push({
      label: 'Показать в проводнике',
      icon: 'folder',
      action: () => api.showItem(node.path)
    });
    items.push({
      label: 'Копировать путь',
      icon: 'copy',
      action: () => {
        const done = () => toast('Путь скопирован');
        const fail = () => toast('Не удалось скопировать путь');
        if (api.copyText) {
          Promise.resolve(api.copyText(node.path)).then((ok) => (ok ? done() : fail()));
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(node.path).then(done, fail);
        } else {
          fail();
        }
      }
    });
  }
  items.push({ sep: true });
  items.push({
    label: 'Удалить ветку',
    key: 'Del',
    icon: 'trash',
    danger: true,
    disabled: !!isRoot,
    action: () => deleteNode(node.id)
  });
  return items;
}

function canvasCtxItems() {
  return [
    {
      label: 'Создать ветку',
      key: 'N',
      icon: 'plus',
      action: () => addBranch(state.selectedId)
    },
    {
      label: 'Импортировать папку…',
      key: 'I',
      icon: 'import',
      action: () => importFolder()
    },
    { sep: true },
    { label: 'Вписать всё', key: 'F', icon: 'fit', action: () => fitView() },
    {
      label: 'Отменить',
      key: 'Ctrl+Z',
      icon: 'undo',
      disabled: history.index <= 0,
      action: () => undo()
    },
    {
      label: 'Повторить',
      key: 'Ctrl+Y',
      icon: 'redo',
      disabled: history.index >= history.stack.length - 1,
      action: () => redo()
    }
  ];
}

function bindContextMenu() {
  const canvas = $('#canvas');
  if (canvas) {
    canvas.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.node')) return;
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, canvasCtxItems());
    });
  }
  document.addEventListener('pointerdown', (e) => {
    const menu = $('#ctx-menu');
    if (menu && !menu.hidden && !e.target.closest('.ctx-menu')) closeCtxMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCtxMenu();
  });
  window.addEventListener('resize', closeCtxMenu);
  canvas.addEventListener('wheel', closeCtxMenu, { passive: true });
}

function bindCanvas() {
  const canvas = $('#canvas');

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false }
  );

  let panning = false;
  let sx = 0, sy = 0, ox = 0, oy = 0;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.node')) return;
    if (e.target.closest('.zoombar') || e.target.closest('.dock')) return;
    panning = true;
    sx = e.clientX; sy = e.clientY;
    ox = state.view.x; oy = state.view.y;
    canvas.classList.add('panning');
  });

  window.addEventListener('pointermove', (e) => {
    if (!panning) return;
    state.view.x = ox + (e.clientX - sx);
    state.view.y = oy + (e.clientY - sy);
    applyView();
  });

  window.addEventListener('pointerup', () => {
    panning = false;
    canvas.classList.remove('panning');
  });

  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.node')) return;
    if (state.selectedId) select(null);
  });
}


function renderAll(opts = {}) {
  renderSidebar();
  renderCanvas(opts);
  renderInspector();
  applyView();
  const p = project();
  $('#proj-title').textContent = p ? p.name : '—';
  $('#live-count').textContent = p
    ? `${p.nodes.length} узлов · ${projectStats(p).files} файлов`
    : 'нет данных';
  $('#btn-delete').disabled = !state.selectedId;
}


function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $$('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
}

function bindUI() {
  $$('.theme-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.theme = b.dataset.theme;
      applyTheme(state.theme);
      save();
      toast('Тема: ' + b.querySelector('.theme-label').textContent);
    });
  });

  $('#win-min').addEventListener('click', () => api.minimize());
  $('#win-max').addEventListener('click', () => api.maximize());
  $('#win-close').addEventListener('click', () => api.close());

  $('#btn-new-project').addEventListener('click', createProject);
  $('#project-search').addEventListener('input', renderSidebar);
  $('#proj-title').addEventListener('click', renameProject);

  $('#btn-arrange').addEventListener('click', async () => {
    const dir = await api.openSchemaDir();
    toast(dir ? 'Папка схем: ' + dir : 'Папка схем открыта');
  });
  $('#btn-relayout').addEventListener('click', cycleLayout);
  $('#btn-delete').addEventListener('click', () => {
    if (!state.selectedId) {
      const b = $('#btn-delete');
      b.classList.remove('flash');
      void b.offsetWidth;
      b.classList.add('flash');
      toast('Сначала выберите ветку на холсте');
      return;
    }
    deleteNode(state.selectedId);
  });
  $('#btn-new').addEventListener('click', () => addBranch(state.selectedId));
  $('#btn-import').addEventListener('click', importFolder);

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);

  $('#empty-new').addEventListener('click', () => createProject());
  $('#empty-import').addEventListener('click', importFolder);

  $('#zoom-in').addEventListener('click', () => zoomAt(1.18));
  $('#zoom-out').addEventListener('click', () => zoomAt(1 / 1.18));
  $('#zoom-fit').addEventListener('click', fitView);

  bindCanvas();
  bindContextMenu();

  window.addEventListener(
    'keydown',
    (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const k = (e.key || '').toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      e.preventDefault();
      e.stopPropagation();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
    },
    true
  );

  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedId) {
        e.preventDefault();
        deleteNode(state.selectedId);
      }
    } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
      fitView();
    } else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
      addBranch(state.selectedId);
    } else if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') {
      cycleLayout();
    } else if (e.key === 'F2' && state.selectedId) {
      e.preventDefault();
      editNode(state.selectedId);
    } else if (e.key === 'Escape') {
      select(null);
    }
  });
}

function seedDemo() {
  const p = makeProject('StarsItems');
  const root = p.nodes[0];
  root.desc = 'Демо-проект: структура плагина';
  root.tags = ['root', 'demo'];

  const mk = (parent, title, desc, tags, kind = 'branch') => {
    const n = makeNode({ parentId: parent.id, title, desc, tags, kind });
    p.nodes.push(n);
    return n;
  };

  const core = mk(root, 'Ядро плагина', 'Основная логика и менеджеры', ['core', 'java']);
  mk(core, 'Менеджеры предметов', 'Регистрация, кэш, слушатели', ['manager']);
  mk(core, 'События', 'Кастомные Bukkit-ивенты', ['events']);
  mk(core, 'Команды', 'Регистрация команд и алиасов', ['commands']);
  mk(root, 'Конфигурация', 'YAML-конфиги и дефолты', ['config', 'yaml']);
  mk(root, 'Ресурсы', 'Модели, текстуры, звуки', ['assets']);
  mk(root, 'Тесты', 'Unit и интеграционные тесты', ['tests']);

  state.projects.push(p);
  state.activeId = p.id;
}

async function init() {
  const saved = await api.loadStore().catch(() => null);
  if (saved && Array.isArray(saved.projects) && saved.projects.length) {
    state.projects = saved.projects;
    state.activeId = saved.activeId && saved.projects.some((p) => p.id === saved.activeId)
      ? saved.activeId
      : saved.projects[0].id;
    state.theme = THEME_ALIAS[saved.theme] || saved.theme || 'red';
  } else {
    seedDemo();
  }

  applyTheme(state.theme);
  bindUI();

  const p = project();
  if (p && p.nodes.every((n) => !n.x && !n.y)) {
    layoutTree(p, p.layout || 'tree', { silent: true });
  }

  renderAll({ animate: true });
  setTimeout(() => fitView(), 150);
  pushHistory();
  updateHistoryButtons();
}

init();
