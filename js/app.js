import { db, requestPersistence, storageEstimate } from './db.js';
import { providers, prettyOpenAI } from './providers.js';
import { renderMarkdown, enhanceCode } from './md.js';

const VERSION = '0.1.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isExtension = location.protocol === 'chrome-extension:';
const coarse = matchMedia('(pointer: coarse)').matches;

const DEFAULTS = {
  anthropicKey: '', openaiKey: '', system: '', maxTokens: 8192, voiceLang: 'en-IN', theme: 'auto',
  chatModel: '', imageModel: '', imgSize: '1024x1024', imgQuality: 'auto', web: false, tools: false,
  connectors: [], models: { anthropic: [], openai: [], image: [], fetchedAt: 0 },
};

const state = {
  settings: { ...DEFAULTS },
  chats: [],
  chat: null,          // current chat object
  view: 'chat',
  mode: 'chat',
  pending: [],         // attachments waiting to be sent: { id, name, type, size, blob }
  controller: null,    // AbortController while a reply is streaming
  urls: new Map(),     // fileId -> object URL
  libFilter: 'all',
  dlgFile: null,
};

/* ---------------- Helpers ---------------- */

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

async function saveSettings() { await db.put('kv', state.settings, 'settings'); }

async function saveChat(chat) {
  chat.updated = Date.now();
  await db.put('chats', chat);
  if (!state.chats.find(c => c.id === chat.id)) state.chats.unshift(chat);
  state.chats.sort((a, b) => b.updated - a.updated);
  renderChatList();
}

function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function fileUrl(id) {
  if (state.urls.has(id)) return state.urls.get(id);
  const f = await db.get('files', id);
  if (!f) return '';
  const url = URL.createObjectURL(f.blob);
  state.urls.set(id, url);
  return url;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function fmt(n) { return (n || 0).toLocaleString('en-IN'); }
function monthKey() { return new Date().toISOString().slice(0, 7); }
function extOf(name) { return ((name || '').split('.').pop() || 'file').slice(0, 4).toUpperCase(); }
const TEXT_EXT = /\.(txt|md|csv|json|js|ts|py|php|html?|css|xml|ya?ml|sql|log|ini|env|sh)$/i;
function isTextFile(f) { return /^text\//.test(f.type) || /json|xml|javascript/.test(f.type) || TEXT_EXT.test(f.name); }

function modelLabel(provider, id) {
  const list = provider === 'anthropic' ? state.settings.models.anthropic : [...state.settings.models.openai, ...state.settings.models.image];
  const m = list.find(x => x.id === id);
  if (m) return m.name;
  return provider === 'openai' ? prettyOpenAI(id || '') : (id || '');
}

/* ---------------- Theme ---------------- */

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ---------------- Usage tally ---------------- */

async function tally(model, { input = 0, output = 0, images = 0 }) {
  const all = (await db.get('kv', 'usage')) || {};
  const mk = monthKey();
  all[mk] = all[mk] || {};
  const row = all[mk][model] || { input: 0, output: 0, images: 0 };
  row.input += input; row.output += output; row.images += images;
  all[mk][model] = row;
  await db.put('kv', all, 'usage');
}

/* ---------------- Models ---------------- */

async function refreshModels({ quiet = false } = {}) {
  const s = state.settings;
  const status = [];
  if (s.anthropicKey) {
    try {
      s.models.anthropic = await providers.anthropic.listModels(s.anthropicKey);
      status.push({ ok: true, text: `Claude connected: ${s.models.anthropic.length} models` });
    } catch (e) { status.push({ ok: false, text: e.message }); }
  } else {
    s.models.anthropic = [];
    status.push({ ok: false, text: 'No Anthropic key yet, so Claude models are off.' });
  }
  if (s.openaiKey) {
    try {
      const r = await providers.openai.listModels(s.openaiKey);
      s.models.openai = r.chat;
      s.models.image = r.image;
      status.push({ ok: true, text: `OpenAI connected: ${r.chat.length} chat models, ${r.image.length} image models` });
    } catch (e) { status.push({ ok: false, text: e.message }); }
  } else {
    s.models.openai = []; s.models.image = [];
    status.push({ ok: false, text: 'No OpenAI key yet, so ChatGPT models and images are off.' });
  }
  s.models.fetchedAt = Date.now();
  pickDefaults();
  await saveSettings();
  renderModelSelect();
  renderKeyStatus(status);
  if (state.view === 'chat' && state.chat && !state.chat.messages.length) renderMessages();
  if (!quiet) toast('Model list updated');
  return status;
}

function pickDefaults() {
  const s = state.settings;
  const chatIds = [...s.models.anthropic.map(m => `anthropic:${m.id}`), ...s.models.openai.map(m => `openai:${m.id}`)];
  if (!chatIds.includes(s.chatModel)) {
    const sonnet = s.models.anthropic.find(m => /sonnet/i.test(m.id));
    s.chatModel = sonnet ? `anthropic:${sonnet.id}` : (chatIds[0] || '');
  }
  const imgIds = s.models.image.map(m => m.id);
  if (!imgIds.includes(s.imageModel)) {
    const pref = imgIds.find(id => /^gpt-image-2(?!\.)/.test(id)) || imgIds.find(id => /^gpt-image/.test(id)) || imgIds[0];
    s.imageModel = pref || '';
  }
}

function renderModelSelect() {
  const sel = $('#modelSelect');
  const s = state.settings;
  sel.innerHTML = '';
  if (state.mode === 'image') {
    if (!s.models.image.length) {
      sel.append(new Option(s.openaiKey ? 'No image models found' : 'Add OpenAI key in Settings', ''));
    } else {
      for (const m of s.models.image) sel.append(new Option(m.name, m.id));
      sel.value = s.imageModel;
    }
    return;
  }
  const groups = [['Claude', 'anthropic', s.models.anthropic], ['ChatGPT (OpenAI)', 'openai', s.models.openai]];
  let any = false;
  for (const [label, p, list] of groups) {
    if (!list.length) continue;
    any = true;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const m of list) g.append(new Option(m.name, `${p}:${m.id}`));
    sel.append(g);
  }
  if (!any) sel.append(new Option('Add an API key in Settings', ''));
  else sel.value = s.chatModel;
}

/* ---------------- Sidebar ---------------- */

function renderChatList() {
  const list = $('#chatList');
  const q = $('#search').value.trim().toLowerCase();
  list.innerHTML = '';
  const chats = state.chats.filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => (m.content || '').toLowerCase().includes(q)));
  if (!chats.length) {
    const p = document.createElement('p');
    p.className = 'empty-list';
    p.textContent = q ? 'No chats match that search.' : 'Your chats will show here.';
    list.append(p);
    return;
  }
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const week = startToday.getTime() - 6 * 864e5;
  let last = '';
  for (const c of chats) {
    const g = c.updated >= startToday.getTime() ? 'Today' : c.updated >= week ? 'This week' : 'Older';
    if (g !== last) {
      const h = document.createElement('div');
      h.className = 'chat-group';
      h.textContent = g;
      list.append(h);
      last = g;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chat-item';
    b.textContent = c.title;
    b.title = c.title;
    if (state.chat && state.chat.id === c.id && state.view === 'chat') b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => { openChat(c.id); closeDrawer(); });
    list.append(b);
  }
}

function openDrawer() { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }

/* ---------------- Views ---------------- */

function setView(v) {
  state.view = v;
  $('#view-chat').hidden = v !== 'chat';
  $('#view-library').hidden = v !== 'library';
  $('#view-settings').hidden = v !== 'settings';
  $('#chatActions').hidden = v !== 'chat' || !state.chat || !state.chat.messages.length;
  $$('.side-link').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === v)));
  $('#topTitle').textContent = v === 'library' ? 'Library' : v === 'settings' ? 'Settings' : (state.chat ? state.chat.title : 'New chat');
  if (v === 'library') renderLibrary();
  if (v === 'settings') renderSettings();
  renderChatList();
  closeDrawer();
}

function newChat() {
  if (state.controller) return toast('Wait for the current reply to finish, or stop it first.');
  state.chat = { id: uid(), title: 'New chat', created: Date.now(), updated: Date.now(), messages: [] };
  state.pending = [];
  renderAttachRow();
  setView('chat');
  renderMessages();
  if (!coarse) $('#input').focus();
}

function openChat(id) {
  if (state.controller && state.chat && state.chat.id !== id) return toast('Wait for the current reply to finish, or stop it first.');
  const c = state.chats.find(x => x.id === id);
  if (!c) return;
  state.chat = c;
  setView('chat');
  renderMessages();
}

/* ---------------- Messages ---------------- */

function welcomeEl() {
  const s = state.settings;
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = `<svg aria-hidden="true"><use href="#i-star"/></svg>
    <h2>Sabeel</h2><div class="arabic" lang="ar">سبيل</div>
    <p></p><div class="provider-state"></div>`;
  const p = $('p', w);
  const ps = $('.provider-state', w);
  const pill = (ok, text) => { const span = document.createElement('span'); span.className = `pill ${ok ? 'ok' : 'off'}`; span.textContent = text; ps.append(span); };
  if (!s.anthropicKey && !s.openaiKey) {
    p.textContent = 'Add your Anthropic or OpenAI API key to start. You only pay for what you use.';
    const b = document.createElement('button');
    b.className = 'btn btn-primary';
    b.type = 'button';
    b.textContent = 'Add API keys';
    b.addEventListener('click', () => setView('settings'));
    ps.append(b);
  } else {
    p.textContent = state.mode === 'image' ? 'Describe the image you want. Attach a photo to edit it.' : 'Ask anything. Switch models from the menu below at any time.';
    pill(!!s.anthropicKey, s.anthropicKey ? 'Claude ready' : 'Claude: no key');
    pill(!!s.openaiKey, s.openaiKey ? 'ChatGPT and images ready' : 'ChatGPT: no key');
    const on = s.connectors.filter(c => c.enabled).length;
    if (on) pill(true, `${on} connector${on > 1 ? 's' : ''} added`);
  }
  return w;
}

function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  const chat = state.chat;
  $('#topTitle').textContent = chat ? chat.title : 'New chat';
  $('#chatActions').hidden = !chat || !chat.messages.length;
  if (!chat || !chat.messages.length) { box.append(welcomeEl()); return; }
  chat.messages.forEach((m, i) => box.append(msgEl(m, i === chat.messages.length - 1)));
  scrollToEnd(true);
}

function attachStrip(ids) {
  const strip = document.createElement('div');
  strip.className = 'attach-strip';
  for (const id of ids) {
    const chip = document.createElement('span');
    chip.className = 'att';
    strip.append(chip);
    db.get('files', id).then(async f => {
      if (!f) { chip.textContent = 'File removed'; return; }
      if (/^image\//.test(f.type)) { const img = document.createElement('img'); img.alt = ''; img.src = await fileUrl(id); chip.append(img); }
      else { const e = document.createElement('span'); e.className = 'ext'; e.textContent = extOf(f.name); chip.append(e); }
      const n = document.createElement('span'); n.textContent = f.name; chip.append(n);
    });
  }
  return strip;
}

function msgEl(m, isLast) {
  const el = document.createElement('article');
  el.className = `msg ${m.role}`;
  el.dataset.id = m.id;
  if (m.role === 'user') {
    if (m.attachments && m.attachments.length) el.append(attachStrip(m.attachments));
    if (m.content) { const b = document.createElement('div'); b.className = 'bubble'; b.textContent = m.content; el.append(b); }
    return el;
  }
  el.innerHTML = '<div class="msg-head"></div><div class="tools"></div><div class="md"></div><div class="gen-images"></div><div class="msg-foot"></div>';
  fillAssistant(el, m, isLast);
  return el;
}

function fillAssistant(el, m, isLast) {
  $('.msg-head', el).textContent = modelLabel(m.provider, m.model) + (m.kind === 'image' ? ', image' : '');

  const tools = $('.tools', el);
  tools.innerHTML = '';
  for (const t of m.tools || []) {
    const d = document.createElement('details');
    d.className = `tool${t.isError ? ' error' : ''}`;
    const sum = document.createElement('summary');
    sum.textContent = t.server === 'web' ? `Searched the web${t.input && t.input.query ? `: ${t.input.query}` : ''}` : `Used ${t.name} on ${t.server}${t.isError ? ' (failed)' : t.result == null ? '…' : ''}`;
    d.append(sum);
    if (t.input) { const pre = document.createElement('pre'); pre.textContent = typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2); d.append(pre); }
    if (t.result) { const pre = document.createElement('pre'); pre.textContent = t.result; d.append(pre); }
    tools.append(d);
  }

  const body = $('.md', el);
  if (m.content) {
    body.innerHTML = renderMarkdown(m.content);
    enhanceCode(body, { onPreview: openCodePreview });
  } else if (m.pending && m.kind !== 'image') {
    body.innerHTML = '<span class="typing" aria-label="Writing"><i></i><i></i><i></i></span>';
  } else body.innerHTML = '';

  const imgs = $('.gen-images', el);
  imgs.innerHTML = '';
  if (m.kind === 'image' && m.pending) {
    const w = document.createElement('div'); w.className = 'img-wait'; w.textContent = 'Making your image…'; imgs.append(w);
  }
  for (const id of m.images || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Open image');
    const img = document.createElement('img');
    img.alt = m.prompt || 'Generated image';
    fileUrl(id).then(u => { img.src = u; });
    b.append(img);
    b.addEventListener('click', () => openFileDialog(id));
    imgs.append(b);
  }

  if (m.error) {
    const e = document.createElement('div');
    e.className = 'err';
    e.textContent = m.error;
    body.append(e);
  }

  const foot = $('.msg-foot', el);
  foot.innerHTML = '';
  if (m.pending) return;
  if (m.usage && (m.usage.input || m.usage.output)) {
    const u = document.createElement('span');
    u.className = 'usage';
    u.textContent = `${fmt(m.usage.input)} in, ${fmt(m.usage.output)} out tokens`;
    foot.append(u);
  }
  if (m.content) {
    const c = document.createElement('button');
    c.className = 'mini-btn'; c.type = 'button'; c.textContent = 'Copy';
    c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(m.content); toast('Copied'); } catch { toast('Copy failed'); } });
    foot.append(c);
  }
  if (isLast) {
    const r = document.createElement('button');
    r.className = 'mini-btn'; r.type = 'button'; r.textContent = m.error ? 'Try again' : 'Regenerate';
    r.addEventListener('click', regenerate);
    foot.append(r);
  }
}

function updateMsg(m) {
  const el = $(`.msg[data-id="${m.id}"]`);
  if (!el) return;
  const last = state.chat.messages[state.chat.messages.length - 1];
  fillAssistant(el, m, last && last.id === m.id);
}

function nearBottom() { const s = $('#scroller'); return s.scrollHeight - s.scrollTop - s.clientHeight < 140; }
function scrollToEnd(force) { const s = $('#scroller'); if (force || nearBottom()) s.scrollTop = s.scrollHeight; }

/* ---------------- Attachments ---------------- */

function renderAttachRow() {
  const row = $('#attachRow');
  row.innerHTML = '';
  row.hidden = !state.pending.length;
  for (const f of state.pending) {
    const chip = document.createElement('span');
    chip.className = 'att';
    if (/^image\//.test(f.type)) { const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(f.blob); chip.append(img); }
    else { const e = document.createElement('span'); e.className = 'ext'; e.textContent = extOf(f.name); chip.append(e); }
    const n = document.createElement('span'); n.textContent = f.name; chip.append(n);
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', `Remove ${f.name}`);
    x.addEventListener('click', () => { state.pending = state.pending.filter(p => p.id !== f.id); renderAttachRow(); });
    chip.append(x);
    row.append(chip);
  }
}

function addFiles(fileList) {
  for (const file of fileList) {
    const okType = /^image\//.test(file.type) || file.type === 'application/pdf' || isTextFile(file);
    if (!okType) { toast(`${file.name}: only images, PDFs and text files work. Save Word or Excel files as PDF first.`, 4200); continue; }
    if (file.size > 20 * 1024 * 1024) { toast(`${file.name} is over 20 MB. Use a smaller file.`); continue; }
    state.pending.push({ id: uid(), name: file.name || 'pasted-image.png', type: file.type || 'application/octet-stream', size: file.size, blob: file });
  }
  renderAttachRow();
}

// Turn a stored message into provider-neutral parts.
async function partsFor(m) {
  const parts = [];
  if (m.role === 'user') {
    for (const id of m.attachments || []) {
      const f = await db.get('files', id);
      if (!f) continue;
      if (/^image\//.test(f.type)) parts.push({ kind: 'image', mime: f.type, b64: await blobToB64(f.blob), name: f.name });
      else if (f.type === 'application/pdf') parts.push({ kind: 'pdf', b64: await blobToB64(f.blob), name: f.name });
      else parts.push({ kind: 'text', text: `File: ${f.name}\n\n${await f.blob.text()}` });
    }
    if (m.content) parts.push({ kind: 'text', text: m.content });
  } else if (m.kind === 'image') {
    parts.push({ kind: 'text', text: `[I generated an image for: ${m.prompt || 'the request'}]` });
  } else if (m.content) {
    parts.push({ kind: 'text', text: m.content });
  }
  return parts;
}

async function buildHistory(messages) {
  const out = [];
  for (const m of messages) {
    if (m.error || m.pending) continue;
    const parts = await partsFor(m);
    if (!parts.length) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.parts.push(...parts);
    else out.push({ role: m.role, parts });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/* ---------------- Sending ---------------- */

async function send() {
  if (state.controller) { state.controller.abort(); return; }
  if (state.sending) return;
  state.sending = true;
  try { await sendInner(); } finally { state.sending = false; }
}

async function sendInner() {
  const input = $('#input');
  const text = input.value.trim();
  if (!text && !state.pending.length) return;
  const s = state.settings;

  if (state.mode === 'image') {
    if (!s.openaiKey) { toast('Add your OpenAI key in Settings to make images.'); return setView('settings'); }
    if (!s.imageModel) { toast('No image model found. Refresh models in Settings.'); return; }
    if (!text) { toast('Describe the image you want.'); return; }
  } else {
    if (!s.chatModel) { toast('Add an API key in Settings first.'); return setView('settings'); }
  }

  const chat = state.chat;
  const toSave = state.pending;
  state.pending = [];
  renderAttachRow();
  input.value = '';
  autoGrow();
  const ids = [];
  for (const p of toSave) {
    await db.put('files', { id: p.id, name: p.name, type: p.type, size: p.size, blob: p.blob, created: Date.now(), source: 'upload', chatId: chat.id });
    ids.push(p.id);
  }

  const userMsg = { id: uid(), role: 'user', content: text, attachments: ids, created: Date.now() };
  if (!chat.messages.length) chat.title = (text || (ids.length ? 'Files' : 'New chat')).replace(/\s+/g, ' ').slice(0, 60);
  chat.messages.push(userMsg);
  await saveChat(chat);
  renderMessages();
  await runAssistant(chat, state.mode);
}

async function regenerate() {
  if (state.controller) return;
  const chat = state.chat;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== 'assistant') return;
  const kind = last.kind === 'image' ? 'image' : 'chat';
  chat.messages.pop();
  await saveChat(chat);
  renderMessages();
  await runAssistant(chat, kind);
}

function setBusy(busy) {
  const b = $('#sendBtn');
  b.innerHTML = `<svg><use href="#${busy ? 'i-stop' : 'i-send'}"/></svg>`;
  b.setAttribute('aria-label', busy ? 'Stop' : 'Send');
}

async function runAssistant(chat, kind) {
  const s = state.settings;
  const lastUser = [...chat.messages].reverse().find(m => m.role === 'user');
  const controller = new AbortController();
  state.controller = controller;
  setBusy(true);

  if (kind === 'image') {
    const m = { id: uid(), role: 'assistant', kind: 'image', provider: 'openai', model: s.imageModel, prompt: lastUser.content, images: [], content: '', pending: true, created: Date.now() };
    chat.messages.push(m);
    renderMessages();
    try {
      const refs = [];
      for (const id of lastUser.attachments || []) {
        const f = await db.get('files', id);
        if (f && /^image\//.test(f.type)) { const b = f.blob; try { b.name = f.name; } catch { /* read-only */ } refs.push(b); }
      }
      const r = await providers.openai.generateImage({ key: s.openaiKey, model: s.imageModel, prompt: lastUser.content, size: s.imgSize, quality: s.imgQuality, refs, signal: controller.signal });
      for (const img of r.images) {
        const id = uid();
        await db.put('files', { id, name: `sabeel-${new Date().toISOString().slice(0, 10)}-${id.slice(-5)}.png`, type: img.mime, size: img.blob.size, blob: img.blob, created: Date.now(), source: 'generated', chatId: chat.id, prompt: lastUser.content, model: s.imageModel });
        m.images.push(id);
      }
      if (r.usage) m.usage = { input: r.usage.input_tokens || 0, output: r.usage.output_tokens || 0 };
      await tally(s.imageModel, { input: m.usage ? m.usage.input : 0, output: m.usage ? m.usage.output : 0, images: r.images.length });
    } catch (e) {
      m.error = e.name === 'AbortError' ? 'Stopped.' : e.message;
    }
    m.pending = false;
    finish(chat, m);
    return;
  }

  const [provider, ...rest] = s.chatModel.split(':');
  const model = rest.join(':');
  const key = provider === 'anthropic' ? s.anthropicKey : s.openaiKey;
  const m = { id: uid(), role: 'assistant', provider, model, content: '', tools: [], pending: true, created: Date.now() };
  chat.messages.push(m);
  renderMessages();

  let raf = 0;
  const paint = () => { raf = 0; updateMsg(m); scrollToEnd(); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  try {
    const history = await buildHistory(chat.messages.slice(0, -1));
    const connectors = s.tools ? s.connectors.filter(c => c.enabled) : [];
    if (s.tools && !connectors.length) toast('No connectors are switched on. Add one in Settings.');
    const r = await providers[provider].stream({
      key, model, system: s.system, history, maxTokens: Number(s.maxTokens) || 8192,
      web: s.web, connectors, signal: controller.signal,
      onText: t => { m.content += t; schedule(); },
      onTools: list => { m.tools = list.map(x => ({ ...x })); schedule(); },
    });
    m.usage = r.usage;
    await tally(model, r.usage);
  } catch (e) {
    if (e.name === 'AbortError') { if (!m.content) m.error = 'Stopped.'; }
    else m.error = e.message;
  }
  if (raf) cancelAnimationFrame(raf);
  m.pending = false;
  finish(chat, m);
}

async function finish(chat, m) {
  state.controller = null;
  setBusy(false);
  await saveChat(chat);
  if (state.chat && state.chat.id === chat.id) { renderMessages(); }
}

/* ---------------- Composer ---------------- */

function autoGrow() {
  const t = $('#input');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, window.innerHeight * 0.4) + 'px';
}

function setMode(mode) {
  state.mode = mode;
  $$('.mode-switch button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#imageOpts').hidden = mode !== 'image';
  $('#webWrap').hidden = mode === 'image';
  $('#toolsWrap').hidden = mode === 'image';
  $('#input').placeholder = mode === 'image' ? 'Describe the image you want' : 'Message Sabeel';
  renderModelSelect();
  if (state.chat && !state.chat.messages.length) renderMessages();
}

function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const btn = $('#micBtn');
  btn.hidden = false;
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = state.settings.voiceLang || 'en-IN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = e => {
      const text = [...e.results].map(r => r[0].transcript).join(' ');
      const inp = $('#input');
      inp.value = (inp.value ? inp.value.trimEnd() + ' ' : '') + text;
      autoGrow();
    };
    rec.onerror = e => { if (e.error !== 'aborted') toast(e.error === 'not-allowed' ? 'Allow microphone access to use voice typing.' : 'Voice typing stopped. Try again.'); };
    rec.onend = () => { rec = null; btn.classList.remove('recording'); };
    btn.classList.add('recording');
    rec.start();
  });
}

/* ---------------- Library ---------------- */

async function renderLibrary() {
  const grid = $('#libGrid');
  grid.innerHTML = '';
  let files = (await db.getAll('files')).sort((a, b) => b.created - a.created);
  if (state.libFilter !== 'all') files = files.filter(f => f.source === state.libFilter);
  $$('#libFilter button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === state.libFilter)));
  if (!files.length) {
    const p = document.createElement('p');
    p.className = 'lib-empty';
    p.textContent = state.libFilter === 'upload' ? 'Files you attach in chats will appear here.' : 'Images you make in Image mode will appear here.';
    grid.append(p);
  }
  for (const f of files) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-item';
    if (/^image\//.test(f.type)) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = f.prompt || f.name;
      img.loading = 'lazy';
      fileUrl(f.id).then(u => { img.src = u; });
      b.append(img);
    } else {
      const d = document.createElement('div');
      d.className = 'thumb file';
      d.textContent = extOf(f.name);
      b.append(d);
    }
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = f.prompt || f.name;
    b.append(cap);
    b.addEventListener('click', () => openFileDialog(f.id));
    grid.append(b);
  }
  const est = await storageEstimate();
  $('#storageNote').textContent = est ? `Using ${(est.usage / 1048576).toFixed(1)} MB on this device.` : '';
}

async function openFileDialog(id) {
  const f = await db.get('files', id);
  if (!f) return toast('That file was deleted.');
  state.dlgFile = f;
  const body = $('#dlgBody');
  body.innerHTML = '';
  $('#dlgTitle').textContent = f.name;
  $('#dlgDownload').hidden = false;
  $('#dlgDelete').hidden = false;
  $('#dlgOpenChat').hidden = !state.chats.find(c => c.id === f.chatId);
  if (/^image\//.test(f.type)) {
    const img = document.createElement('img');
    img.alt = f.prompt || f.name;
    img.src = await fileUrl(f.id);
    body.append(img);
  } else if (isTextFile(f)) {
    const pre = document.createElement('pre');
    pre.textContent = (await f.blob.text()).slice(0, 20000);
    body.append(pre);
  } else {
    const p = document.createElement('p');
    p.textContent = `${f.name}, ${(f.size / 1024).toFixed(0)} KB. Download it to open.`;
    body.append(p);
  }
  if (f.prompt) { const p = document.createElement('p'); p.className = 'prompt'; p.textContent = f.prompt; body.append(p); }
  $('#previewDlg').showModal();
}

function openCodePreview(code, lang) {
  state.dlgFile = null;
  $('#dlgTitle').textContent = `Preview (${lang})`;
  $('#dlgDownload').hidden = false;
  $('#dlgOpenChat').hidden = true;
  $('#dlgDelete').hidden = true;
  const body = $('#dlgBody');
  body.innerHTML = '';
  const fr = document.createElement('iframe');
  fr.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
  fr.srcdoc = lang.toLowerCase() === 'svg' ? `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>` : code;
  body.append(fr);
  state.dlgCode = { code, lang };
  $('#previewDlg').showModal();
}

/* ---------------- Settings ---------------- */

function renderKeyStatus(items) {
  const ul = $('#keyStatus');
  ul.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = it.ok ? 'ok' : 'bad';
    li.textContent = it.text;
    ul.append(li);
  }
}

function renderConnectors() {
  const ul = $('#connList');
  ul.innerHTML = '';
  for (const c of state.settings.connectors) {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<b></b><small></small>';
    $('b', meta).textContent = c.name;
    $('small', meta).textContent = c.url + (c.token ? ' (token saved)' : '');
    const lab = document.createElement('label');
    lab.className = 'check';
    lab.style.margin = '0';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = c.enabled;
    cb.addEventListener('change', async () => { c.enabled = cb.checked; await saveSettings(); });
    lab.append(cb, document.createTextNode(' On'));
    const del = document.createElement('button');
    del.className = 'mini-btn';
    del.type = 'button';
    del.textContent = 'Remove';
    del.addEventListener('click', async () => {
      state.settings.connectors = state.settings.connectors.filter(x => x.id !== c.id);
      await saveSettings();
      renderConnectors();
    });
    li.append(meta, lab, del);
    ul.append(li);
  }
  if (!state.settings.connectors.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.style.border = '0';
    li.textContent = 'No connectors yet.';
    ul.append(li);
  }
}

async function renderUsage() {
  const t = $('#usageTable');
  const all = (await db.get('kv', 'usage')) || {};
  const rows = Object.entries(all[monthKey()] || {});
  t.innerHTML = '<thead><tr><th>Model</th><th>Input tokens</th><th>Output tokens</th><th>Images</th></tr></thead>';
  const tb = document.createElement('tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4">Nothing used yet this month.</td></tr>';
  }
  for (const [model, r] of rows) {
    const tr = document.createElement('tr');
    const cells = [model, fmt(r.input), fmt(r.output), fmt(r.images)];
    cells.forEach((v, i) => { const td = document.createElement('td'); td.textContent = v; if (i) td.className = 'n'; tr.append(td); });
    tb.append(tr);
  }
  t.append(tb);
}

function renderSettings() {
  const s = state.settings;
  $('#keyAnthropic').value = s.anthropicKey;
  $('#keyOpenAI').value = s.openaiKey;
  $('#sysPrompt').value = s.system;
  $('#maxTokens').value = s.maxTokens;
  $('#voiceLang').value = s.voiceLang;
  $('#themeSel').value = s.theme;
  $('#appVersion').textContent = `Sabeel ${VERSION}. Data is stored only in this browser on this device.`;
  renderConnectors();
  renderUsage();
  if (!$('#keyStatus').children.length) {
    const items = [];
    if (s.models.anthropic.length) items.push({ ok: true, text: `Claude: ${s.models.anthropic.length} models loaded` });
    if (s.models.openai.length) items.push({ ok: true, text: `OpenAI: ${s.models.openai.length} chat models, ${s.models.image.length} image models loaded` });
    renderKeyStatus(items);
  }
}

/* ---------------- Backup ---------------- */

async function exportAll() {
  toast('Preparing backup…');
  const includeKeys = $('#exportKeys').checked;
  const settings = { ...state.settings };
  if (!includeKeys) { settings.anthropicKey = ''; settings.openaiKey = ''; settings.connectors = settings.connectors.map(c => ({ ...c, token: '' })); }
  const files = [];
  for (const f of await db.getAll('files')) {
    const { blob, ...meta } = f;
    files.push({ ...meta, data: await blobToB64(blob) });
  }
  const data = { app: 'sabeel', version: VERSION, exportedAt: new Date().toISOString(), includesKeys: includeKeys, settings, chats: await db.getAll('chats'), files, usage: (await db.get('kv', 'usage')) || {} };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `sabeel-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

async function importAll(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('That file is not a Sabeel backup.'); }
  if (!data || data.app !== 'sabeel') return toast('That file is not a Sabeel backup.');
  for (const c of data.chats || []) await db.put('chats', c);
  for (const f of data.files || []) {
    const { data: b64, ...meta } = f;
    await db.put('files', { ...meta, blob: b64ToBlob(b64, meta.type) });
  }
  const s = state.settings;
  const inc = data.settings || {};
  if (inc.anthropicKey && !s.anthropicKey) s.anthropicKey = inc.anthropicKey;
  if (inc.openaiKey && !s.openaiKey) s.openaiKey = inc.openaiKey;
  if (inc.system && !s.system) s.system = inc.system;
  for (const c of inc.connectors || []) if (!s.connectors.find(x => x.url === c.url)) s.connectors.push(c);
  await saveSettings();
  state.chats = (await db.getAll('chats')).sort((a, b) => b.updated - a.updated);
  renderChatList();
  renderSettings();
  toast(`Imported ${(data.chats || []).length} chats and ${(data.files || []).length} files.`);
  if (s.anthropicKey || s.openaiKey) refreshModels({ quiet: true });
}

/* ---------------- Install (PWA) ---------------- */

let installEvent = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e;
  $('#installBtn').hidden = false;
});
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Sabeel is installed.'); });

/* ---------------- Wire up ---------------- */

function wire() {
  $('#newChat').addEventListener('click', newChat);
  $('#menuBtn').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#search').addEventListener('input', renderChatList);
  $$('.side-link').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

  $('#composer').addEventListener('submit', e => { e.preventDefault(); send(); });
  const input = $('#input');
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing) { e.preventDefault(); if (!state.controller) send(); }
  });
  input.addEventListener('paste', e => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  const comp = $('#composer');
  comp.addEventListener('dragover', e => { e.preventDefault(); comp.classList.add('drag'); });
  comp.addEventListener('dragleave', () => comp.classList.remove('drag'));
  comp.addEventListener('drop', e => { e.preventDefault(); comp.classList.remove('drag'); addFiles(e.dataTransfer.files); });
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

  $$('.mode-switch button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#modelSelect').addEventListener('change', async e => {
    if (state.mode === 'image') state.settings.imageModel = e.target.value;
    else state.settings.chatModel = e.target.value;
    await saveSettings();
  });
  $('#imgSize').addEventListener('change', async e => { state.settings.imgSize = e.target.value; await saveSettings(); });
  $('#imgQuality').addEventListener('change', async e => { state.settings.imgQuality = e.target.value; await saveSettings(); });
  $('#webToggle').addEventListener('change', async e => { state.settings.web = e.target.checked; await saveSettings(); });
  $('#toolsToggle').addEventListener('change', async e => {
    state.settings.tools = e.target.checked;
    await saveSettings();
    if (e.target.checked && !state.settings.connectors.some(c => c.enabled)) toast('Add a connector in Settings first.');
  });

  $('#renameBtn').addEventListener('click', async () => {
    const name = prompt('Rename chat', state.chat.title);
    if (name && name.trim()) { state.chat.title = name.trim().slice(0, 80); await saveChat(state.chat); $('#topTitle').textContent = state.chat.title; }
  });
  $('#deleteBtn').addEventListener('click', async () => {
    if (!confirm('Delete this chat? Its images stay in your Library.')) return;
    await db.del('chats', state.chat.id);
    state.chats = state.chats.filter(c => c.id !== state.chat.id);
    newChat();
    toast('Chat deleted');
  });
  $('#exportBtn').addEventListener('click', () => {
    const c = state.chat;
    const lines = [`# ${c.title}`, ''];
    for (const m of c.messages) {
      if (m.role === 'user') lines.push('**You:**', '', m.content || '(files)', '');
      else lines.push(`**${modelLabel(m.provider, m.model)}:**`, '', m.kind === 'image' ? `[Image: ${m.prompt}]` : (m.content || m.error || ''), '');
    }
    download(new Blob([lines.join('\n')], { type: 'text/markdown' }), `${c.title.replace(/[^\w\- ]+/g, '').trim() || 'chat'}.md`);
  });

  $$('#libFilter button').forEach(b => b.addEventListener('click', () => { state.libFilter = b.dataset.f; renderLibrary(); }));

  $('#dlgClose').addEventListener('click', () => $('#previewDlg').close());
  $('#previewDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#dlgDownload').addEventListener('click', () => {
    if (state.dlgFile) download(state.dlgFile.blob, state.dlgFile.name);
    else if (state.dlgCode) download(new Blob([state.dlgCode.code], { type: 'text/html' }), `sabeel-preview.${state.dlgCode.lang === 'svg' ? 'svg' : 'html'}`);
  });
  $('#dlgOpenChat').addEventListener('click', () => { const id = state.dlgFile && state.dlgFile.chatId; $('#previewDlg').close(); if (id) openChat(id); });
  $('#dlgDelete').addEventListener('click', async () => {
    const f = state.dlgFile;
    if (!f || !confirm(`Delete ${f.name}?`)) return;
    await db.del('files', f.id);
    const u = state.urls.get(f.id);
    if (u) { URL.revokeObjectURL(u); state.urls.delete(f.id); }
    $('#previewDlg').close();
    toast('Deleted');
    if (state.view === 'library') renderLibrary(); else renderMessages();
  });

  $('#saveKeys').addEventListener('click', async () => {
    state.settings.anthropicKey = $('#keyAnthropic').value.trim();
    state.settings.openaiKey = $('#keyOpenAI').value.trim();
    renderKeyStatus([{ ok: true, text: 'Checking keys…' }]);
    await saveSettings();
    await refreshModels({ quiet: true });
  });
  $('#sysPrompt').addEventListener('change', async e => { state.settings.system = e.target.value; await saveSettings(); toast('Instructions saved'); });
  $('#maxTokens').addEventListener('change', async e => { state.settings.maxTokens = Math.max(256, Number(e.target.value) || 8192); await saveSettings(); });
  $('#voiceLang').addEventListener('change', async e => { state.settings.voiceLang = e.target.value; await saveSettings(); });
  $('#themeSel').addEventListener('change', async e => { state.settings.theme = e.target.value; applyTheme(); await saveSettings(); });
  $('#addConn').addEventListener('click', async () => {
    const name = $('#connName').value.trim();
    const url = $('#connUrl').value.trim();
    const token = $('#connToken').value.trim();
    if (!name || !url) return toast('Give the connector a name and a URL.');
    if (!/^https:\/\//i.test(url)) return toast('The URL must start with https://');
    if (state.settings.connectors.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast('You already have a connector with that name.');
    state.settings.connectors.push({ id: uid(), name, url, token, enabled: true });
    await saveSettings();
    $('#connName').value = ''; $('#connUrl').value = ''; $('#connToken').value = '';
    renderConnectors();
    toast('Connector added');
  });
  $('#exportAll').addEventListener('click', exportAll);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importAll(e.target.files[0]); e.target.value = ''; });
  $('#installBtn').addEventListener('click', async () => { if (!installEvent) return; installEvent.prompt(); installEvent = null; $('#installBtn').hidden = true; });
  $('#wipeBtn').addEventListener('click', async () => {
    if (!confirm('Delete all chats, files, keys and settings on this device? This cannot be undone.')) return;
    await db.clear('chats'); await db.clear('files'); await db.clear('kv');
    location.reload();
  });
}

async function boot() {
  const saved = await db.get('kv', 'settings');
  state.settings = { ...DEFAULTS, ...(saved || {}) };
  state.settings.models = { ...DEFAULTS.models, ...(state.settings.models || {}) };
  applyTheme();
  state.chats = (await db.getAll('chats')).sort((a, b) => b.updated - a.updated);
  // A reply that was cut off (app closed mid-answer) should not stay "writing" forever.
  for (const c of state.chats) for (const m of c.messages) if (m.pending) { m.pending = false; if (!m.content && !(m.images || []).length) m.error = 'This reply was interrupted.'; }

  wire();
  setupVoice();
  $('#webToggle').checked = state.settings.web;
  $('#toolsToggle').checked = state.settings.tools;
  $('#imgSize').value = state.settings.imgSize;
  $('#imgQuality').value = state.settings.imgQuality;
  renderModelSelect();
  newChat();

  requestPersistence();
  const s = state.settings;
  const stale = Date.now() - (s.models.fetchedAt || 0) > 24 * 3600e3;
  if ((s.anthropicKey || s.openaiKey) && stale) refreshModels({ quiet: true });
  if (!s.anthropicKey && !s.openaiKey) setView('settings');

  if ('serviceWorker' in navigator && !isExtension && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install not available */ });
  }
}

boot();
