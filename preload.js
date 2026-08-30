const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close')
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (partial) => ipcRenderer.invoke('config:set', partial),
    browseGamePath: () => ipcRenderer.invoke('config:browseGamePath')
  },

  player: {
    getNickname: () => ipcRenderer.invoke('player:getNickname'),
    setNickname: (nickname) => ipcRenderer.invoke('player:setNickname', nickname)
  },

  setup: {
    isCompleted: () => ipcRenderer.invoke('setup:isCompleted'),
    autoDetectGamePath: () => ipcRenderer.invoke('setup:autoDetectGamePath'),
    complete: (payload) => ipcRenderer.invoke('setup:complete', payload)
  },

  workshop: {
    install: (input) => ipcRenderer.invoke('workshop:install', { input }),
    onProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('workshop:progress', listener);
      return () => ipcRenderer.removeListener('workshop:progress', listener);
    }
  },

  game: {
    launch: (opts) => ipcRenderer.invoke('game:launch', opts)
  },

  servers: {
    queryAll: () => ipcRenderer.invoke('servers:queryAll'),
    query: (ip, port) => ipcRenderer.invoke('servers:query', { ip, port }),
    add: (server) => ipcRenderer.invoke('servers:add', server),
    remove: (index) => ipcRenderer.invoke('servers:remove', index)
  },

  mods: {
    check: () => ipcRenderer.invoke('mods:check'),
    update: () => ipcRenderer.invoke('mods:update'),
    onProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('mods:progress', listener);
      return () => ipcRenderer.removeListener('mods:progress', listener);
    }
  },

  news: {
    fetch: () => ipcRenderer.invoke('news:fetch')
  }
});
