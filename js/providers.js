// Sabeel provider layer. Each provider exposes the same shape:
//   listModels(key) -> [{ id, name }]
//   stream({ key, model, system, history, maxTokens, web, connectors, signal, onText, onTools }) -> { usage }
// Adding another provider later (Gemini etc.) means adding one more block like these.

const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI = 'https://api.openai.com/v1';
const MCP_BETA = 'mcp-client-2025-11-20';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const PROVIDER_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI' };

async function toError(res, provider) {
  let detail = '';
  try {
    const text = await res.text();
    try { const j = JSON.parse(text); detail = (j.error && (j.error.message || j.error.type)) || text; }
    catch { detail = text; }
  } catch { /* ignore */ }
  const name = PROVIDER_NAMES[provider];
  const hints = {
    400: `${name} rejected the request.`,
    401: `${name} rejected the API key. Check it in Settings.`,
    402: `${name} says the account has no credit. Add credit, then try again.`,
    403: `${name} says this key can't use that model or feature.`,
    404: `${name} couldn't find that model. Refresh the model list in Settings.`,
    413: `The message or files are too large for ${name}. Remove an attachment and try again.`,
    429: `${name} rate or spend limit reached. Wait a minute, or check your credit balance.`,
    500: `${name} had a server error. Try again.`,
    529: `${name} is overloaded right now. Try again in a minute.`,
  };
  const base = hints[res.status] || `${name} returned error ${res.status}.`;
  const short = detail && detail.length > 300 ? detail.slice(0, 300) + '…' : detail;
  return new ApiError(short ? `${base} Details: ${short}` : base, res.status);
}

function networkError(provider, err) {
  if (err && err.name === 'AbortError') return err;
  return new ApiError(`Couldn't reach ${PROVIDER_NAMES[provider]}. Check your internet connection and try again.`, 0);
}

async function* sse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      const payload = data.join('\n');
      if (!payload || payload === '[DONE]') continue;
      try { yield { event, data: JSON.parse(payload) }; } catch { /* skip malformed */ }
    }
  }
}

export function slug(name) {
  return (name || 'server').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'server';
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => c.text || (c.type ? `[${c.type}]` : '')).join('\n');
  return content ? JSON.stringify(content) : '';
}

/* ---------------- Anthropic (Claude) ---------------- */

function aHeaders(key, beta) {
  const h = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
  if (beta) h['anthropic-beta'] = beta;
  return h;
}

export const anthropic = {
  async listModels(key) {
    let res;
    try { res = await fetch(`${ANTHROPIC}/models?limit=100`, { headers: aHeaders(key) }); }
    catch (e) { throw networkError('anthropic', e); }
    if (!res.ok) throw await toError(res, 'anthropic');
    const j = await res.json();
    return (j.data || []).map(m => ({ id: m.id, name: m.display_name || m.id }));
  },

  // history: [{ role, parts: [{ kind: 'text'|'image'|'pdf', text, mime, b64, name }] }]
  toMessages(history) {
    return history.map(m => ({
      role: m.role,
      content: m.parts.map(p => {
        if (p.kind === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.b64 } };
        if (p.kind === 'pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.b64 }, title: p.name };
        return { type: 'text', text: p.text };
      }),
    }));
  },

  async stream({ key, model, system, history, maxTokens, web, connectors, signal, onText, onTools }) {
    const body = { model, max_tokens: maxTokens || 8192, messages: this.toMessages(history), stream: true };
    if (system) body.system = system;
    const tools = [];
    let beta = null;
    if (web) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
    if (connectors && connectors.length) {
      beta = MCP_BETA;
      body.mcp_servers = connectors.map(c => {
        const s = { type: 'url', url: c.url, name: slug(c.name) };
        if (c.token) s.authorization_token = c.token;
        return s;
      });
      for (const c of connectors) tools.push({ type: 'mcp_toolset', mcp_server_name: slug(c.name) });
    }
    if (tools.length) body.tools = tools;

    let res;
    try {
      res = await fetch(`${ANTHROPIC}/messages`, { method: 'POST', headers: aHeaders(key, beta), body: JSON.stringify(body), signal });
    } catch (e) { throw networkError('anthropic', e); }
    if (!res.ok) throw await toError(res, 'anthropic');

    const usage = { input: 0, output: 0 };
    const blocks = {};
    const toolLog = [];
    let hadText = false;

    for await (const { data } of sse(res)) {
      switch (data.type) {
        case 'message_start':
          usage.input = (data.message && data.message.usage && data.message.usage.input_tokens) || 0;
          break;
        case 'content_block_start': {
          const b = data.content_block || {};
          blocks[data.index] = { ...b, json: '' };
          if (b.type === 'text') {
            if (hadText) onText('\n\n');
            if (b.text) { onText(b.text); hadText = true; }
          } else if (b.type === 'mcp_tool_use' || b.type === 'server_tool_use') {
            toolLog.push({ id: b.id, name: b.name, server: b.server_name || 'web', input: b.input && Object.keys(b.input).length ? b.input : null, result: null, isError: false });
            onTools(toolLog);
          } else if (b.type === 'mcp_tool_result') {
            const t = toolLog.find(x => x.id === b.tool_use_id);
            if (t) { t.result = textOf(b.content); t.isError = !!b.is_error; onTools(toolLog); }
          } else if (b.type === 'web_search_tool_result') {
            const t = toolLog.find(x => x.id === b.tool_use_id);
            if (t) {
              t.result = Array.isArray(b.content) ? b.content.map(r => `${r.title || ''} ${r.url || ''}`.trim()).join('\n') : textOf(b.content);
              onTools(toolLog);
            }
          }
          break;
        }
        case 'content_block_delta': {
          const d = data.delta || {};
          if (d.type === 'text_delta') { onText(d.text); hadText = true; }
          else if (d.type === 'input_json_delta' && blocks[data.index]) blocks[data.index].json += d.partial_json || '';
          break;
        }
        case 'content_block_stop': {
          const b = blocks[data.index];
          if (b && b.json && (b.type === 'mcp_tool_use' || b.type === 'server_tool_use')) {
            const t = toolLog.find(x => x.id === b.id);
            if (t) { try { t.input = JSON.parse(b.json); } catch { t.input = b.json; } onTools(toolLog); }
          }
          break;
        }
        case 'message_delta':
          if (data.usage && data.usage.output_tokens != null) usage.output = data.usage.output_tokens;
          break;
        case 'error':
          throw new ApiError(`Anthropic stopped with an error: ${(data.error && data.error.message) || 'unknown error'}`, 0);
        default:
          break;
      }
    }
    return { usage };
  },
};

/* ---------------- OpenAI (ChatGPT models) ---------------- */

function oHeaders(key, json = true) {
  const h = { Authorization: `Bearer ${key}` };
  if (json) h['content-type'] = 'application/json';
  return h;
}

const NON_CHAT = /(audio|realtime|tts|transcribe|whisper|embedding|moderation|instruct|davinci|babbage|image|dall-e|computer-use|search-api|sora|deep-research)/;

export function prettyOpenAI(id) {
  return id.replace(/^gpt-/i, 'GPT-').replace(/^chatgpt-/i, 'ChatGPT-').replace(/-(\w)/g, (m, c) => ' ' + c.toUpperCase()).replace(/^(GPT|ChatGPT) /, '$1-');
}

export const openai = {
  async listModels(key) {
    let res;
    try { res = await fetch(`${OPENAI}/models`, { headers: oHeaders(key, false) }); }
    catch (e) { throw networkError('openai', e); }
    if (!res.ok) throw await toError(res, 'openai');
    const j = await res.json();
    const all = (j.data || []).sort((a, b) => (b.created || 0) - (a.created || 0));
    const chat = all.filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !NON_CHAT.test(m.id)).map(m => ({ id: m.id, name: prettyOpenAI(m.id) }));
    const image = all.filter(m => /(gpt-image|dall-e|chatgpt-image)/.test(m.id)).map(m => ({ id: m.id, name: prettyOpenAI(m.id) }));
    return { chat, image };
  },

  toInput(history) {
    return history.map(m => {
      if (m.role === 'assistant') return { role: 'assistant', content: m.parts.map(p => p.text || '').join('\n\n') };
      return {
        role: 'user',
        content: m.parts.map(p => {
          if (p.kind === 'image') return { type: 'input_image', image_url: `data:${p.mime};base64,${p.b64}` };
          if (p.kind === 'pdf') return { type: 'input_file', filename: p.name || 'file.pdf', file_data: `data:application/pdf;base64,${p.b64}` };
          return { type: 'input_text', text: p.text };
        }),
      };
    });
  },

  async stream({ key, model, system, history, maxTokens, web, connectors, signal, onText, onTools }) {
    const body = { model, input: this.toInput(history), stream: true, store: false };
    if (system) body.instructions = system;
    if (maxTokens) body.max_output_tokens = maxTokens;
    const tools = [];
    if (web) tools.push({ type: 'web_search' });
    for (const c of connectors || []) {
      const t = { type: 'mcp', server_label: slug(c.name), server_url: c.url, require_approval: 'never' };
      if (c.token) t.authorization = c.token;
      tools.push(t);
    }
    if (tools.length) body.tools = tools;

    let res;
    try {
      res = await fetch(`${OPENAI}/responses`, { method: 'POST', headers: oHeaders(key), body: JSON.stringify(body), signal });
    } catch (e) { throw networkError('openai', e); }
    if (!res.ok) throw await toError(res, 'openai');

    const usage = { input: 0, output: 0 };
    const toolLog = [];
    let hadText = false;
    let messageItems = 0;

    for await (const { data } of sse(res)) {
      switch (data.type) {
        case 'response.output_item.added':
          if (data.item && data.item.type === 'message') {
            if (messageItems > 0 && hadText) onText('\n\n');
            messageItems++;
          }
          break;
        case 'response.output_text.delta':
          if (data.delta) { onText(data.delta); hadText = true; }
          break;
        case 'response.output_item.done': {
          const it = data.item || {};
          if (it.type === 'mcp_call') {
            let input = it.arguments;
            try { input = JSON.parse(it.arguments); } catch { /* keep string */ }
            toolLog.push({ id: it.id, name: it.name, server: it.server_label, input, result: it.output || (it.error ? textOf(it.error) : ''), isError: !!it.error });
            onTools(toolLog);
          } else if (it.type === 'web_search_call') {
            toolLog.push({ id: it.id, name: 'web_search', server: 'web', input: it.action && it.action.query ? { query: it.action.query } : null, result: null, isError: false });
            onTools(toolLog);
          }
          break;
        }
        case 'response.completed':
          if (data.response && data.response.usage) {
            usage.input = data.response.usage.input_tokens || 0;
            usage.output = data.response.usage.output_tokens || 0;
          }
          break;
        case 'response.failed':
          throw new ApiError(`OpenAI stopped with an error: ${(data.response && data.response.error && data.response.error.message) || 'unknown error'}`, 0);
        case 'error':
          throw new ApiError(`OpenAI stopped with an error: ${data.message || (data.error && data.error.message) || 'unknown error'}`, 0);
        default:
          break;
      }
    }
    return { usage };
  },

  // Returns [{ blob, mime }]. refs = reference images (Blobs) for editing.
  async generateImage({ key, model, prompt, size, quality, refs, signal }) {
    const isDalle = /^dall-e/.test(model);
    let res;
    try {
      if (refs && refs.length && !isDalle) {
        const fd = new FormData();
        fd.append('model', model);
        fd.append('prompt', prompt);
        if (size && size !== 'auto') fd.append('size', size);
        if (quality && quality !== 'auto') fd.append('quality', quality);
        refs.forEach((b, i) => fd.append(refs.length > 1 ? 'image[]' : 'image', b, b.name || `reference-${i + 1}.png`));
        res = await fetch(`${OPENAI}/images/edits`, { method: 'POST', headers: oHeaders(key, false), body: fd, signal });
      } else {
        const body = { model, prompt, n: 1 };
        if (size && size !== 'auto') body.size = size;
        if (isDalle) {
          body.response_format = 'b64_json';
          body.quality = quality === 'high' ? 'hd' : 'standard';
        } else if (quality && quality !== 'auto') {
          body.quality = quality;
        }
        res = await fetch(`${OPENAI}/images/generations`, { method: 'POST', headers: oHeaders(key), body: JSON.stringify(body), signal });
      }
    } catch (e) { throw networkError('openai', e); }
    if (!res.ok) throw await toError(res, 'openai');
    const j = await res.json();
    const out = [];
    for (const d of j.data || []) {
      if (d.b64_json) {
        const bin = atob(d.b64_json);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        out.push({ blob: new Blob([bytes], { type: 'image/png' }), mime: 'image/png' });
      } else if (d.url) {
        try {
          const r = await fetch(d.url);
          const b = await r.blob();
          out.push({ blob: b, mime: b.type || 'image/png' });
        } catch {
          throw new ApiError('OpenAI made the image but it could not be downloaded. Try again.', 0);
        }
      }
    }
    if (!out.length) throw new ApiError('OpenAI returned no image. Try a different prompt.', 0);
    return { images: out, usage: j.usage || null };
  },
};

export const providers = { anthropic, openai };
