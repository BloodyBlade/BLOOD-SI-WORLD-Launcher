const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    // Путь к l4d2.exe (или к папке установки — резолвится в getExePath()).
    gamePath: '',
    // Кастомные параметры командной строки, добавляются при каждом запуске.
    launchOptions: '-novid -high',
    // Никнейм игрока. Пусто -> при первом запуске сгенерируется дефолтный
    // вида "[BS/IW] Player 1234" (см. ensurePlayerNickname ниже).
    playerNickname: '',
    // Мастер установки (первый запуск) пройден?
    setupCompleted: false,
    // URL манифеста модов/плагинов клиента (см. формат в src/pages/mods.js).
    manifestUrl: 'https://example.com/bsiw-world/manifest.json',
    // URL списка новостей/чейнджлога проекта.
    newsUrl: 'https://example.com/bsiw-world/news.json',
    // Список серверов проекта: [{ name, ip, port }]
    servers: [
      { name: 'BLOOD S/I WORLD | Hard SI + BloodTanks', ip: '127.0.0.1', port: 27015 }
    ]
  }
});

// ---------------------------------------------------------------------------
// Никнейм игрока
//
// Если пользователь ещё ни разу не задавал ник, при первом запуске
// генерируется дефолт "[BS/IW] Player NNNN", где NNNN — случайные 4 цифры
// (crypto.randomInt, локально, никак не связано с чьим-либо SteamID).
// Пользователь может в любой момент сменить ник в интерфейсе — тогда
// дефолт больше не перегенерируется.
// ---------------------------------------------------------------------------
function ensurePlayerNickname() {
  const current = store.get('playerNickname');
  if (current && current.trim()) return current;

  const suffix = crypto.randomInt(1000, 10000); // 4 случайные цифры
  const generated = `[BS/IW] Player ${suffix}`;
  store.set('playerNickname', generated);
  return generated;
}

let mainWindow;

// ---------------------------------------------------------------------------
// Мастер установки — автопоиск папки Left 4 Dead 2
//
// Ищем left4dead2.exe сначала по стандартному пути Steam, затем во всех
// дополнительных библиотеках Steam (парсим libraryfolders.vdf). Ничего не
// трогает реестр — если Steam стоит не туда, пользователь просто жмёт
// «Обзор…» и указывает путь вручную.
// ---------------------------------------------------------------------------
function candidateSteamRoots() {
  const roots = [];
  if (process.platform === 'win32') {
    roots.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  } else if (process.platform === 'darwin') {
    roots.push(path.join(app.getPath('home'), 'Library', 'Application Support', 'Steam'));
  } else {
    roots.push(
      path.join(app.getPath('home'), '.steam', 'steam'),
      path.join(app.getPath('home'), '.local', 'share', 'Steam')
    );
  }
  return roots.filter((p) => fs.existsSync(p));
}

function parseLibraryFolders(vdfPath) {
  // Простой парсер под конкретную задачу: достаём все значения "path" из
  // libraryfolders.vdf, не поднимая полноценный VDF-парсер как зависимость.
  if (!fs.existsSync(vdfPath)) return [];
  const text = fs.readFileSync(vdfPath, 'utf8');
  const matches = [...text.matchAll(/"path"\s*"([^"]+)"/g)];
  return matches.map((m) => m[1].replace(/\\\\/g, '\\'));
}

function findL4D2Exe() {
  const exeName = process.platform === 'win32' ? 'left4dead2.exe' : 'left4dead2';
  const libraries = new Set();

  for (const steamRoot of candidateSteamRoots()) {
    libraries.add(steamRoot);
    const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
    for (const libPath of parseLibraryFolders(vdf)) libraries.add(libPath);
  }

  for (const lib of libraries) {
    const candidate = path.join(lib, 'steamapps', 'common', 'Left 4 Dead 2', exeName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

ipcMain.handle('setup:autoDetectGamePath', () => findL4D2Exe());

ipcMain.handle('setup:complete', (_evt, { gamePath, nickname } = {}) => {
  if (gamePath) store.set('gamePath', gamePath);
  if (nickname) store.set('playerNickname', String(nickname).trim().slice(0, 32));
  store.set('setupCompleted', true);
  return store.store;
});

ipcMain.handle('setup:isCompleted', () => Boolean(store.get('setupCompleted')));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#14100e',
    frame: false, // кастомный титлбар — см. src/index.html
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  ensurePlayerNickname();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// Титлбар (frame: false => сворачивание/закрытие рисуем сами)
// ---------------------------------------------------------------------------
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:close', () => mainWindow?.close());

// ---------------------------------------------------------------------------
// Конфиг
// ---------------------------------------------------------------------------
ipcMain.handle('config:get', () => store.store);

ipcMain.handle('config:set', (_evt, partial) => {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key, value);
  }
  return store.store;
});

// ---------------------------------------------------------------------------
// Никнейм игрока — отдельный хендлер поверх config:get/set, чтобы
// гарантировать, что пустое значение всегда заменяется дефолтным.
// ---------------------------------------------------------------------------
ipcMain.handle('player:getNickname', () => ensurePlayerNickname());

ipcMain.handle('player:setNickname', (_evt, nickname) => {
  const trimmed = String(nickname || '').trim().slice(0, 32); // разумный лимит длины
  if (!trimmed) {
    // Пустая строка -> пользователь очистил поле, возвращаем дефолт заново.
    store.set('playerNickname', '');
    return ensurePlayerNickname();
  }
  store.set('playerNickname', trimmed);
  return trimmed;
});

ipcMain.handle('config:browseGamePath', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Укажите left4dead2.exe',
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  store.set('gamePath', result.filePaths[0]);
  return result.filePaths[0];
});

// ---------------------------------------------------------------------------
// Запуск игры
// ---------------------------------------------------------------------------
// Два режима:
//  1) Есть explicit путь к exe -> спавним процесс напрямую с аргументами.
//  2) Пути нет -> используем steam:// протокол (требует Steam запущенным,
//     но не требует от пользователя указывать путь вручную).
ipcMain.handle('game:launch', async (_evt, { connectIp, connectPort } = {}) => {
  const gamePath = store.get('gamePath');
  const extraOptions = store.get('launchOptions') || '';
  const nickname = ensurePlayerNickname();

  const args = extraOptions.split(' ').filter(Boolean);
  // +name задаёт отображаемое имя игрока (стандартный клиентский cvar
  // Source-движка, применяется на клиенте, не имеет отношения к серверной
  // авторизации/DRM).
  args.push('+name', nickname);
  if (connectIp && connectPort) {
    args.push('+connect', `${connectIp}:${connectPort}`);
  }

  if (gamePath && fs.existsSync(gamePath)) {
    // spawn() не бросает исключение синхронно при неудаче (файл заблокирован
    // антивирусом, нет прав на исполнение и т.п.) — ошибка прилетает
    // асинхронно через событие 'error'. Ждём либо успешный старт процесса,
    // либо эту ошибку, чтобы кнопка «Играть» не зависала молча.
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(gamePath, args, {
          cwd: path.dirname(gamePath),
          detached: true,
          stdio: 'ignore'
        });
      } catch (err) {
        resolve({ ok: false, error: String(err.message || err) });
        return;
      }

      child.once('error', (err) => {
        resolve({ ok: false, error: String(err.message || err) });
      });
      child.once('spawn', () => {
        child.unref();
        resolve({ ok: true, mode: 'exe' });
      });
    });
  }

  // Фолбэк: steam://run/550//<args>
  // Строка тут — плоская, поэтому аргументы с пробелами (ник) нужно
  // обернуть в кавычки, иначе он разобьётся на несколько токенов.
  const steamArgString = args
    .map((a) => (a.includes(' ') ? `"${a}"` : a))
    .join(' ');
  const steamArgs = encodeURIComponent(steamArgString);
  const steamUrl = `steam://run/550//${steamArgs}`;
  try {
    await shell.openExternal(steamUrl);
    return { ok: true, mode: 'steam' };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// ---------------------------------------------------------------------------
// Запрос состояния Source-сервера (протокол A2S_INFO, порт тот же, что и
// игровой, но UDP). Даёт живой пинг/карту/кол-во игроков без стороннего API.
// ---------------------------------------------------------------------------
function queryServer(ip, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const started = Date.now();
    let settled = false;

    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(data);
    };

    const timer = setTimeout(() => finish({ online: false, error: 'timeout' }), timeoutMs);

    const A2S_INFO_HEADER = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54]);
    const A2S_INFO_PAYLOAD = Buffer.concat([A2S_INFO_HEADER, Buffer.from('Source Engine Query\0', 'ascii')]);

    function send(payload) {
      socket.send(payload, 0, payload.length, port, ip, (err) => {
        if (err) finish({ online: false, error: String(err) });
      });
    }

    socket.on('error', (err) => finish({ online: false, error: String(err) }));

    socket.on('message', (msg) => {
      // Заголовок: FF FF FF FF, затем тип пакета
      const type = msg[4];

      if (type === 0x41) {
        // Challenge response — пересылаем запрос с приложенным challenge.
        const challenge = msg.subarray(5, 9);
        send(Buffer.concat([A2S_INFO_PAYLOAD, challenge]));
        return;
      }

      if (type !== 0x49) {
        finish({ online: false, error: 'unexpected_response' });
        return;
      }

      try {
        let off = 5;
        off += 1; // protocol version

        function readCString() {
          const start = off;
          while (msg[off] !== 0 && off < msg.length) off++;
          const str = msg.toString('utf8', start, off);
          off += 1; // skip null terminator
          return str;
        }

        const name = readCString();
        const map = readCString();
        readCString(); // folder
        const game = readCString();

        off += 2; // appid (int16 LE) — не парсим, не нужен
        const players = msg.readUInt8(off); off += 1;
        const maxPlayers = msg.readUInt8(off); off += 1;
        const bots = msg.readUInt8(off); off += 1;

        finish({
          online: true,
          ping: Date.now() - started,
          name,
          map,
          game,
          players,
          maxPlayers,
          bots
        });
      } catch (err) {
        finish({ online: false, error: 'parse_error' });
      }
    });

    send(A2S_INFO_PAYLOAD);
  });
}

ipcMain.handle('servers:query', async (_evt, { ip, port }) => {
  return queryServer(ip, port);
});

ipcMain.handle('servers:queryAll', async () => {
  const servers = store.get('servers') || [];
  const results = await Promise.all(
    servers.map(async (s) => ({ ...s, status: await queryServer(s.ip, s.port) }))
  );
  return results;
});

ipcMain.handle('servers:add', (_evt, server) => {
  const servers = store.get('servers') || [];
  servers.push(server);
  store.set('servers', servers);
  return servers;
});

ipcMain.handle('servers:remove', (_evt, index) => {
  const servers = store.get('servers') || [];
  servers.splice(index, 1);
  store.set('servers', servers);
  return servers;
});

// ---------------------------------------------------------------------------
// Простой HTTP(S) GET JSON — без лишних зависимостей.
// ---------------------------------------------------------------------------
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tmpPath = destPath + '.part';
    const fileStream = fs.createWriteStream(tmpPath);

    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fileStream.close();
        fs.unlinkSync(tmpPath);
        downloadFile(res.headers.location, destPath, onProgress).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });

      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          fs.renameSync(tmpPath, destPath);
          resolve();
        });
      });
    }).on('error', (err) => {
      fileStream.close();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      reject(err);
    });
  });
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve(null);
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Обновление модов/плагинов.
//
// Ожидаемый формат manifest.json:
// {
//   "version": "2025.08.30",
//   "files": [
//     { "path": "left4dead2/addons/l4d2_BloodTanks.smx", "url": "https://.../l4d2_BloodTanks.smx", "sha256": "..." },
//     ...
//   ]
// }
//
// "path" — относительно папки установки игры (gamePath).
// ---------------------------------------------------------------------------
ipcMain.handle('mods:check', async () => {
  const manifestUrl = store.get('manifestUrl');
  const manifest = await fetchJson(manifestUrl);

  const gamePath = store.get('gamePath');
  const gameDir = gamePath ? path.dirname(gamePath) : null;

  const toUpdate = [];
  for (const file of manifest.files) {
    if (!gameDir) {
      toUpdate.push(file);
      continue;
    }
    const localPath = path.join(gameDir, file.path);
    const localHash = await sha256OfFile(localPath);
    if (localHash !== file.sha256) {
      toUpdate.push(file);
    }
  }

  return { version: manifest.version, total: manifest.files.length, toUpdate };
});

ipcMain.handle('mods:update', async (event) => {
  const manifestUrl = store.get('manifestUrl');
  const manifest = await fetchJson(manifestUrl);

  const gamePath = store.get('gamePath');
  if (!gamePath) {
    throw new Error('Сначала укажите путь к игре в настройках.');
  }
  const gameDir = path.dirname(gamePath);

  const send = (payload) => event.sender.send('mods:progress', payload);

  let done = 0;
  const total = manifest.files.length;

  for (const file of manifest.files) {
    const localPath = path.join(gameDir, file.path);
    const localHash = await sha256OfFile(localPath);

    if (localHash !== file.sha256) {
      send({ stage: 'downloading', file: file.path, done, total });
      await downloadFile(file.url, localPath, (received, fileTotal) => {
        send({ stage: 'progress', file: file.path, received, fileTotal, done, total });
      });
    }

    done += 1;
    send({ stage: 'file-complete', file: file.path, done, total });
  }

  send({ stage: 'complete', done, total, version: manifest.version });
  return { ok: true, version: manifest.version };
});

// ---------------------------------------------------------------------------
// Новости проекта
// ---------------------------------------------------------------------------
ipcMain.handle('news:fetch', async () => {
  const newsUrl = store.get('newsUrl');
  return fetchJson(newsUrl);
});

// ---------------------------------------------------------------------------
// Установка модов из Steam Workshop через SteamCMD (официальная утилита
// Valve, анонимный вход). Workshop L4D2 (appid 550) официально разрешает
// анонимную загрузку контента — этим же способом много лет пользуются
// админы выделенных серверов, чтобы скачать аддон без запуска Steam-клиента.
//
// Мы НЕ парсим сторонние сайты-зеркала: их разметка нестабильна, у них нет
// публичного API, и такой скрейпинг может в любой момент перестать
// работать или нарушать условия использования площадки. SteamCMD даёт тот
// же результат (VPK на диске) официальным и куда более надёжным путём.
// ---------------------------------------------------------------------------
const STEAMCMD_DIR = path.join(app.getPath('userData'), 'steamcmd');
const STEAMCMD_EXE = path.join(STEAMCMD_DIR, process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');

function steamCmdDownloadUrl() {
  if (process.platform === 'win32') return 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
  if (process.platform === 'darwin') return 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz';
  return 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
}

function extractArchive(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    if (archivePath.endsWith('.zip')) {
      // extract-zip — единственная новая зависимость, добавлена в package.json.
      const extract = require('extract-zip');
      extract(archivePath, { dir: destDir }).then(resolve, reject);
      return;
    }
    // .tar.gz на Linux/macOS — используем системный tar, чтобы не тащить
    // ещё одну зависимость только ради одной платформы.
    const tar = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
    tar.on('error', reject);
    tar.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar завершился с кодом ${code}`))));
  });
}

async function ensureSteamCmd(onProgress) {
  if (fs.existsSync(STEAMCMD_EXE)) return STEAMCMD_EXE;

  fs.mkdirSync(STEAMCMD_DIR, { recursive: true });
  const url = steamCmdDownloadUrl();
  const archivePath = path.join(STEAMCMD_DIR, path.basename(url));

  onProgress?.({ stage: 'steamcmd-downloading' });
  await downloadFile(url, archivePath);

  onProgress?.({ stage: 'steamcmd-extracting' });
  await extractArchive(archivePath, STEAMCMD_DIR);
  fs.unlinkSync(archivePath);

  if (process.platform !== 'win32' && fs.existsSync(STEAMCMD_EXE)) {
    fs.chmodSync(STEAMCMD_EXE, 0o755);
  }

  if (!fs.existsSync(STEAMCMD_EXE)) {
    throw new Error('Не удалось распаковать SteamCMD — проверьте подключение к интернету и повторите.');
  }
  return STEAMCMD_EXE;
}

function runSteamCmdWorkshopDownload(steamcmdPath, workshopId, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(steamcmdPath, [
      '+login', 'anonymous',
      '+workshop_download_item', '550', String(workshopId),
      '+quit'
    ], { cwd: STEAMCMD_DIR });

    let lastError = null;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      onLine?.(text);
      if (/ERROR!\s*Download item failed/i.test(text)) lastError = text.trim();
    });
    child.stderr.on('data', (chunk) => onLine?.(chunk.toString()));

    child.on('error', reject);
    child.on('exit', (code) => {
      if (lastError) {
        reject(new Error(
          'SteamCMD не смог скачать предмет — обычно это значит, что автор закрыл ' +
          'аддон для анонимной загрузки, либо ID указан неверно. Подробности: ' + lastError
        ));
        return;
      }
      if (code !== 0) {
        reject(new Error(`SteamCMD завершился с кодом ${code}.`));
        return;
      }
      resolve();
    });
  });
}

function findVpkFilesRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findVpkFilesRecursive(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.vpk')) results.push(full);
  }
  return results;
}

function extractWorkshopId(input) {
  const str = String(input || '').trim();
  // Принимаем: чистый ID, ссылку ?id=XXXX, или ссылку .../filedetails/XXXX
  const match = str.match(/(\d{6,})/);
  return match ? match[1] : null;
}

ipcMain.handle('workshop:install', async (event, { input } = {}) => {
  const send = (payload) => event.sender.send('workshop:progress', payload);

  const gamePath = store.get('gamePath');
  if (!gamePath || !fs.existsSync(gamePath)) {
    throw new Error('Сначала укажите путь к left4dead2.exe (Мастер установки или вкладка «Настройки»).');
  }

  const workshopId = extractWorkshopId(input);
  if (!workshopId) {
    throw new Error('Не удалось найти ID мода. Вставьте ссылку на страницу Workshop или сам числовой ID.');
  }

  const gameDir = path.dirname(gamePath);
  const addonsDir = path.join(gameDir, 'left4dead2', 'addons');
  fs.mkdirSync(addonsDir, { recursive: true });

  send({ stage: 'steamcmd-setup' });
  const steamcmdPath = await ensureSteamCmd(send);

  send({ stage: 'downloading', workshopId });
  await runSteamCmdWorkshopDownload(steamcmdPath, workshopId, (line) => send({ stage: 'log', line }));

  const contentDir = path.join(STEAMCMD_DIR, 'steamapps', 'workshop', 'content', '550', workshopId);
  const vpkFiles = findVpkFilesRecursive(contentDir);

  if (vpkFiles.length === 0) {
    throw new Error(
      'SteamCMD отработал, но VPK-файлов не найдено — либо это не аддон L4D2, ' +
      'либо контент не собран в .vpk (редко для Workshop-модов L4D2).'
    );
  }

  send({ stage: 'copying', total: vpkFiles.length });
  const installed = [];
  for (const vpkPath of vpkFiles) {
    const destName = path.basename(vpkPath);
    fs.copyFileSync(vpkPath, path.join(addonsDir, destName));
    installed.push(destName);
    send({ stage: 'file-complete', file: destName, done: installed.length, total: vpkFiles.length });
  }

  send({ stage: 'complete', installed, workshopId });
  return { ok: true, installed, workshopId, addonsDir };
});
