// Markdown rendering with sanitising, copy buttons on code, and a live
// preview for HTML/SVG code (a small taste of Claude-style artifacts).
/* global marked, DOMPurify */

if (window.DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }
  const html = marked.parse(text || '', { gfm: true, breaks: true });
  return DOMPurify.sanitize(html);
}

export function enhanceCode(root, { onCopy, onPreview } = {}) {
  root.querySelectorAll('pre > code').forEach(code => {
    const pre = code.parentElement;
    if (pre.parentElement && pre.parentElement.classList.contains('code-wrap')) return;
    const lang = ((code.className || '').match(/language-([\w-]+)/) || [])[1] || '';
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    const label = document.createElement('span');
    label.textContent = lang || 'code';
    bar.append(label);
    const actions = document.createElement('span');
    actions.className = 'code-actions';
    if (/^(html|svg|xml)$/i.test(lang) && onPreview) {
      const pv = document.createElement('button');
      pv.type = 'button';
      pv.textContent = 'Preview';
      pv.addEventListener('click', () => onPreview(code.textContent, lang));
      actions.append(pv);
    }
    const cp = document.createElement('button');
    cp.type = 'button';
    cp.textContent = 'Copy';
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code.textContent); cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1400); if (onCopy) onCopy(); }
      catch { cp.textContent = 'Copy failed'; }
    });
    actions.append(cp);
    bar.append(actions);
    pre.replaceWith(wrap);
    wrap.append(bar, pre);
  });
}
