'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600, height: 980, show: false,
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  await win.loadFile(path.join(root, 'index.html'));
  await new Promise((r) => setTimeout(r, 2500));
  const out = await win.webContents.executeJavaScript(`(() => {
    const txt = (sel) => { const el = document.querySelector(sel); return el ? el.innerText.replace(/\\n+/g, ' | ') : null; };
    return {
      title: document.title,
      topbar: txt('.topbar'),
      sidebar: txt('.sidebar'),
      canvas: txt('#canvas'),
      inspector: txt('.inspector'),
      empty: txt('#empty-state'),
      nodes: [...document.querySelectorAll('.node-card')].map(c => c.innerText.replace(/\\n+/g, ' / ')).slice(0, 12),
      projects: [...document.querySelectorAll('.proj-item')].map(c => c.innerText.replace(/\\n+/g, ' / '))
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
  app.quit();
});
