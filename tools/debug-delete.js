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
ipcMain.handle('clipboard:write', () => true);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600, height: 980, show: false,
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true }
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) errors.push(msg);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('RENDER GONE: ' + JSON.stringify(d)));
  await win.loadFile(path.join(root, 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));
  const out = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const res = { steps: [] };
    const p1 = makeProject('main');
    state.projects = [p1];
    openProject(p1.id, true);
    await wait(200);
    res.steps.push({ at: 'created', projects: state.projects.length, active: state.activeId, nodes: document.querySelectorAll('.node').length });
    res.emptyVisible = getComputedStyle(document.getElementById('empty-state')).display;
    const delPromise = deleteProject(p1.id);
    await wait(400);
    const confirmBtn = [...document.querySelectorAll('#modal-foot .btn')].find(b => b.textContent.includes('Удалить'));
    res.hasConfirm = !!confirmBtn;
    if (confirmBtn) confirmBtn.click();
    await delPromise;
    await wait(400);
    res.steps.push({ at: 'deleted', projects: state.projects.length, active: state.activeId, nodes: document.querySelectorAll('.node').length });
    res.emptyVisible2 = getComputedStyle(document.getElementById('empty-state')).display;
    res.projTitle = document.getElementById('proj-title').textContent;
    res.liveCount = document.getElementById('live-count').textContent;
    return res;
  })()`);
  console.log(JSON.stringify({ ...out, errors }, null, 2));
  app.quit();
});
