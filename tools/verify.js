'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const root = path.join(__dirname, '..');
const windowActions = [];
const pageErrors = [];

ipcMain.handle('store:load', () => null);
ipcMain.handle('store:save', () => true);
ipcMain.handle('dialog:folder', () => null);
ipcMain.handle('fs:scan', () => null);
ipcMain.handle('shell:show', () => true);
ipcMain.handle('shell:open', () => true);
ipcMain.handle('clipboard:write', () => true);
ipcMain.handle('schema:write', () => 'ok');
ipcMain.handle('schema:open', () => root);

for (const action of ['minimize', 'maximize', 'close']) {
  ipcMain.handle(`win:${action}`, () => windowActions.push(action));
}
ipcMain.handle('win:isMaximized', () => false);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(root, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) pageErrors.push(message);
  });

  try {
    await win.loadFile(path.join(root, 'index.html'));
    await new Promise((resolve) => setTimeout(resolve, 750));

    const result = await win.webContents.executeJavaScript(`(async () => {
      const required = ['.app', '.sidebar', '#canvas', '#proj-title', '#win-min', '#win-max', '#win-close'];
      const missing = required.filter((selector) => !document.querySelector(selector));
      const projectCount = document.querySelectorAll('.proj-item').length;
      const nodeCount = document.querySelectorAll('.node').length;

      for (const id of ['win-min', 'win-max', 'win-close']) {
        const button = document.getElementById(id);
        if (button) button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        title: document.title,
        missing,
        projectCount,
        nodeCount,
        apiAvailable: !!(window.api && window.api.minimize && window.api.maximize && window.api.close)
      };
    })()`);

    const failures = [];
    if (result.missing.length) failures.push(`Missing UI elements: ${result.missing.join(', ')}`);
    if (!result.apiAvailable) failures.push('Window control API is unavailable');
    if (result.projectCount < 1 || result.nodeCount < 1) failures.push('Demo project did not render');
    if (windowActions.length !== 3) failures.push(`Expected 3 window control calls, got ${windowActions.length}`);
    if (pageErrors.length) failures.push(`Renderer errors: ${pageErrors.join('; ')}`);

    console.log(JSON.stringify({ ...result, windowActions, pageErrors, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.quit();
  }
});
