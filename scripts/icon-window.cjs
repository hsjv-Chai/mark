// Dedicated, isolated Chromium canvas for reproducible SVG rasterization.
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL('data:text/html,<meta charset="utf-8"><title>Mark icon renderer</title>');
});
