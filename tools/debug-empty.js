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
    const res = {};
    const empty = document.getElementById('empty-state');
    const state0 = () => ({ cls: empty.className, disp: getComputedStyle(empty).display, n: (project() || {nodes:[]}).nodes.length });

    const np = makeProject('TestEmpty');
    state.projects.push(np);
    openProject(np.id, true);
    await wait(300);
    res.afterCreate = state0();

    addBranch(null);
    await wait(500);
    res.afterBranch = state0();
    res.modalOpen = !document.getElementById('modal-overlay').hidden;
    const save = [...document.querySelectorAll('#modal-foot .btn')].find(b => b.textContent.includes('Сохранить'));
    if (save) save.click();
    await wait(400);
    res.afterSave = state0();
    return res;
  })()`);
  console.log(JSON.stringify(out, null, 2));
  app.quit();
});
