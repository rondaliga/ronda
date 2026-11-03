const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('rondaDesktop', { plataforma: process.platform });
