'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const APP_NAME = 'InfiniteWeb';
const APP_ID = 'dev.stars.infiniteweb';

let win = null;

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const storeFile = () => path.join(app.getPath('userData'), 'infiniteweb-store.json');
const legacyStoreFile = () =>
  path.join(app.getPath('appData'), 'starsinfiniteweb', 'starsinfiniteweb-store.json');

function readStore() {
  const files = [storeFile(), legacyStoreFile()];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    } catch {
    }
  }
  return null;
}

function writeStore(data) {
  const file = storeFile();
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return true;
}


const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'coverage',
  '__pycache__', '.venv', 'venv', 'env', 'target', 'bin', 'obj', '.next',
  '.nuxt', '.cache', '.parcel-cache', '.gradle', '.idea', '.vscode', '.mvn',
  'vendor', 'bower_components', '.pytest_cache', '.mypy_cache', 'site-packages'
]);

const MAX_ENTRIES = 700;
const MAX_DEPTH = 5;

async function scanDir(dir, depth, counter) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const out = [];
  for (const entry of entries) {
    if (counter.count >= MAX_ENTRIES) break;
    const name = entry.name;
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name.toLowerCase())) continue;
      const child = await scanDir(full, depth + 1, counter);
      if (!child) continue;
      if (child.children.length === 0) continue;
      out.push(child);
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = (await fsp.stat(full)).size;
      } catch {
        size = 0;
      }
      counter.count += 1;
      out.push({
        type: 'file',
        name,
        path: full,
        size,
        ext: path.extname(name).slice(1).toLowerCase()
      });
    }
  }

  return {
    type: 'dir',
    name: path.basename(dir) || dir,
    path: dir,
    children: out,
    truncated: counter.count >= MAX_ENTRIES
  };
}


function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1120,
    minHeight: 720,
    frame: false,
    show: false,
    backgroundColor: '#050505',
    title: APP_NAME,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });

  let crashCount = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    const reason = (details && details.reason) || 'unknown';
    console.error('[renderer gone]', reason);
    if (reason === 'clean-exit' || reason === 'killed' || reason === 'application-exit') return;
    crashCount += 1;
    if (crashCount > 3) {
      console.error('[renderer] too many crashes, not reloading');
      return;
    }
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.reload();
    }, 400);
  });
  win.webContents.on('unresponsive', () => {
    console.error('[renderer] unresponsive');
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[load]', code, desc);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


ipcMain.handle('store:load', () => readStore());
ipcMain.handle('store:save', (_e, data) => writeStore(data));

ipcMain.handle('dialog:folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Выберите папку для анализа',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Анализировать'
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('fs:scan', async (_e, dir) => {
  if (!dir) return null;
  const counter = { count: 0 };
  const tree = await scanDir(dir, 0, counter);
  if (!tree) return null;
  tree.truncated = counter.count >= MAX_ENTRIES;
  return tree;
});

ipcMain.handle('shell:show', (_e, target) => {
  if (!target) return false;
  shell.showItemInFolder(target);
  return true;
});

const schemasDir = () => path.join(app.getPath('userData'), 'schemas');

ipcMain.handle('schema:write', async (_e, payload) => {
  const dir = schemasDir();
  await fsp.mkdir(dir, { recursive: true });
  const safe =
    String(payload?.name || 'project')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim() || 'project';
  const file = path.join(dir, `${safe}.schema.json`);
  await fsp.writeFile(file, JSON.stringify(payload?.data ?? {}, null, 2), 'utf8');
  return file;
});

ipcMain.handle('schema:open', async () => {
  const dir = schemasDir();
  await fsp.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('shell:open', async (_e, target) => {
  if (!target) return false;
  const err = await shell.openPath(target);
  return !err;
});

ipcMain.handle('clipboard:write', (_e, text) => {
  try {
    clipboard.writeText(String(text ?? ''));
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('win:minimize', () => {
  if (win) win.minimize();
});

ipcMain.handle('win:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.handle('win:close', () => {
  if (win) win.close();
});

ipcMain.handle('win:isMaximized', () => (win ? win.isMaximized() : false));
