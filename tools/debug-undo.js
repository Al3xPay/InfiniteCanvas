'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const root = path.join(__dirname, '..');

ipcMain.handle('store:load', () => null);
ipcMain.handle('store:save', () => true);
ipcMain.handle('dialog:folder', () => null);
ipcMain.handle('fs:scan', () => null);
ipcMain.handle('shell:show', () => true);
ipcMain.handle('shell:open', () => true);
ipcMain.handle('schema:write', () => 'ok');
ipcMain.handle('schema:open', () => root);
ipcMain.handle('win:minimize', () => {});
ipcMain.handle('win:maximize', () => {});
ipcMain.handle('win:close', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600, height: 980, show: false,
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  await win.loadFile(path.join(root, 'index.html'));
  await new Promise((r) => setTimeout(r, 2000));
  const out = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const res = { steps: [] };
    const snap = () => ({
      nodes: document.querySelectorAll('.node').length,
      idx: history.index,
      len: history.stack.length,
      active: document.activeElement ? document.activeElement.tagName + '#' + document.activeElement.id : null
    });
    res.steps.push({ at: 'start', ...snap() });

    document.getElementById('btn-new').click();
    await wait(600);
    res.steps.push({ at: 'after add', ...snap() });

    const save = [...document.querySelectorAll('#modal-foot .btn')].find(b => b.textContent.includes('Сохранить'));
    res.hasSave = !!save;
    if (save) save.click();
    await wait(700);
    res.steps.push({ at: 'after save', ...snap() });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await wait(600);
    res.steps.push({ at: 'after undo', ...snap() });
    res.toastText = document.getElementById('toast-wrap').innerText;
    res.undoBtnDisabled = document.getElementById('btn-undo').disabled;
    return res;
  })()`);
  console.log(JSON.stringify(out, null, 2));
  app.quit();
});
