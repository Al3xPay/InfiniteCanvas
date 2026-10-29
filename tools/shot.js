'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    show: false,
    backgroundColor: '#050505',
    webPreferences: {
      preload: path.join(root, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.on('console-message', (_e, level, message) => {
    console.log('[renderer]', level, message);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[gone]', JSON.stringify(d)));

  await win.loadFile(path.join(root, 'index.html'));
  await new Promise((r) => setTimeout(r, 3000));

  const img = await win.webContents.capturePage();
  const out = path.join(__dirname, 'shot.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('saved', out);
  app.quit();
});
