'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600, height: 980, show: false,
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true }
  });
  await win.loadFile(path.join(root, 'index.html'));
  await new Promise((r) => setTimeout(r, 2000));

  await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelector('.theme-btn[data-theme="mono"]').click();
    await wait(300);
  })()`);

  const cdp = await win.webContents.debugger.attach('1.3');
  await cdp.sendCommand('DOM.enable');
  await cdp.sendCommand('CSS.enable');
  const { root: docRoot } = await cdp.sendCommand('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.sendCommand('DOM.querySelector', { nodeId: docRoot.nodeId, selector: '.dock-btn.primary' });
  const matched = await cdp.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
  const out = [];
  for (const m of matched.matchedCSSRules || []) {
    const rule = m.rule;
    const props = (rule.style.cssProperties || []).filter((p) => p.name === 'color' || p.name === 'background' || p.name === 'background-image');
    if (!props.length) continue;
    out.push({
      selector: rule.selectorList.text,
      props: props.map((p) => ({ name: p.name, value: p.value, important: p.important, disabled: p.disabled })),
      origin: rule.origin
    });
  }
  const inherited = (matched.inherited || [])
    .filter((m) => m.inlineStyle)
    .map((m) => ({ selector: m.matchedSelectors.join(' '), props: m.inlineStyle.cssProperties.filter((p) => p.name === 'color').map((p) => p.value) }));
  console.log(JSON.stringify({ out, inherited, computed: await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.dock-btn.primary'); const cs = getComputedStyle(b); return { color: cs.color, bg: cs.backgroundColor, onPrimary: cs.getPropertyValue('--on-primary'), theme: document.documentElement.dataset.theme }; })()`) }, null, 2));
  win.webContents.debugger.detach();
  app.quit();
});
