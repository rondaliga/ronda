/* Ronda Hospitalar para macOS (Electron). Serve a pasta www/ pelo endereço app://ronda,
   que é um "contexto seguro" (câmera e criptografia funcionam) e mantém os dados sempre no mesmo lugar. */
const { app, BrowserWindow, protocol, net, session, shell, Menu, systemPreferences } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const WWW = path.join(__dirname, '..', 'www');
let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 600,
    backgroundColor: '#0b2740', title: 'Ronda Hospitalar',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  janela.loadURL('app://ronda/index.html');
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  janela.on('closed', () => { janela = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });
  app.whenReady().then(async () => {
    protocol.handle('app', req => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const f = path.normalize(path.join(WWW, p));
      if (!f.startsWith(WWW)) return new Response('Acesso negado', { status: 403 });
      return net.fetch(pathToFileURL(f).toString());
    });
    /* só a câmera (e só deste app) é liberada */
    session.defaultSession.setPermissionRequestHandler((wc, permissao, cb) => cb(permissao === 'media' && wc.getURL().startsWith('app://ronda/')));
    session.defaultSession.setPermissionCheckHandler((wc, permissao) => permissao === 'media');
    if (process.platform === 'darwin') { try { await systemPreferences.askForMediaAccess('camera'); } catch (e) {} }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
    ]));
    criarJanela();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) criarJanela(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
