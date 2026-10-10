import { app, BrowserWindow } from 'electron';
import { createAppServer } from '../server.js';

let appServer;
let appUrl;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

async function createMainWindow() {
  if (!appUrl) {
    appServer = createAppServer();
    const port = await listen(appServer);
    appUrl = `http://127.0.0.1:${port}`;
    console.log(`Farming 101 desktop UI served at ${appUrl}`);
  }

  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('zoom-changed', () => {
    const zoomPercent = Math.round(mainWindow.webContents.getZoomFactor() * 100);
    console.log(`Farming 101 zoom: ${zoomPercent}%`);
  });

  await mainWindow.loadURL(appUrl);
  mainWindow.webContents.setZoomFactor(0.9);
  console.log(`Farming 101 default zoom: ${Math.round(mainWindow.webContents.getZoomFactor() * 100)}%`);
}

app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error('Failed to reopen Farming 101:', error);
      });
    }
  });
}).catch((error) => {
  console.error('Failed to start Farming 101:', error);
  app.quit();
});

app.on('before-quit', () => {
  appServer?.close();
});

app.on('window-all-closed', () => {
  app.quit();
});
