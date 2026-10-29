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
  const out = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const res = {};
    const btn = document.querySelector('#btn-new');
    const read = () => {
      const cs = getComputedStyle(btn);
      return { color: cs.color, bg: cs.backgroundColor, img: cs.backgroundImage.slice(0, 40), trans: cs.transition, fill: cs.webkitTextFillColor };
    };
    res.before = read();
    document.querySelector('.theme-btn[data-theme="mono"]').click();
    await wait(100); res.t100 = read();
    await wait(400); res.t500 = read();
    await wait(1500); res.t2000 = read();
    res.theme = document.documentElement.dataset.theme;
    res.onPrimary = getComputedStyle(btn).getPropertyValue('--on-primary');
    res.rootOnPrimary = getComputedStyle(document.documentElement).getPropertyValue('--on-primary');
    res.inline = btn.getAttribute('style');
    res.outer = btn.outerHTML.slice(0, 220);
    res.parent = btn.parentElement.className;
    res.parentOnPrimary = getComputedStyle(btn.parentElement).getPropertyValue('--on-primary');

    const rules = [];
    const collect = (list) => {
      for (const r of list) {
        if (r.cssRules && !r.selectorText) { collect(r.cssRules); continue; }
        if (r.selectorText && r.style && r.style.color) rules.push(r);
      }
    };
    for (const sheet of document.styleSheets) { try { collect(sheet.cssRules); } catch (e) {} }
    const before = getComputedStyle(btn).color;
    const changed = [];
    for (const r of rules) {
      let m = false;
      try { m = btn.matches(r.selectorText); } catch (e) { continue; }
      if (!m) continue;
      const old = r.style.getPropertyValue('color');
      const prio = r.style.getPropertyPriority('color');
      r.style.removeProperty('color');
      const now = getComputedStyle(btn).color;
      r.style.setProperty('color', old, prio);
      if (now !== before) changed.push({ sel: r.selectorText, color: old, prio, without: now });
    }
    res.colorChangedWhenRemoved = changed;
    res.chain = [];
    let el = btn;
    while (el && el.nodeType === 1) {
      const cs = getComputedStyle(el);
      res.chain.push({ tag: el.tagName, cls: el.className, color: cs.color, onPrimary: cs.getPropertyValue('--on-primary'), text: cs.getPropertyValue('--text') });
      el = el.parentElement;
    }
    res.allMatching = rules.filter(r => { try { return btn.matches(r.selectorText); } catch (e) { return false; } }).map(r => r.selectorText + ' => ' + r.style.getPropertyValue('color'));
    return res;
  })()`);
  console.log(JSON.stringify(out, null, 2));
  app.quit();
});
