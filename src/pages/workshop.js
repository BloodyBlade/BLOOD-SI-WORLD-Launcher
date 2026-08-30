window.Pages = window.Pages || {};

window.Pages.workshop = (() => {
  let container;
  let unsubscribeProgress = null;
  let installing = false;

  async function mount(el) {
    container = el;
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Установка модов</h1>
        <span class="hazard-stripe"></span>
      </div>
      <div class="page-subtitle">вставьте ссылку на Steam Workshop — VPK сам ляжет в addons</div>

      <div class="workshop-input-row">
        <input
          class="field-input"
          id="workshop-input"
          type="text"
          spellcheck="false"
          placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=XXXXXXXXX  или просто ID"
        >
        <button class="btn btn-primary" id="btn-install-workshop">Скачать и установить</button>
      </div>

      <div class="field-hint workshop-hint">
        Загрузка идёт через SteamCMD (официальная утилита Valve, анонимный вход) —
        так же, как это делают админы серверов. Первый запуск скачает и распакует
        SteamCMD (~5 МБ), это разовая операция.
      </div>

      <div class="progress-track"><div class="progress-fill" id="workshop-progress-fill"></div></div>

      <div class="mods-file-list" id="workshop-log">
        <div class="mods-file-row">Вставьте ссылку на мод и нажмите «Скачать и установить».</div>
      </div>
    `;

    container.querySelector('#btn-install-workshop').addEventListener('click', install);
    container.querySelector('#workshop-input').addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && !installing) install();
    });
  }

  function appendLog(text, cls) {
    const log = container.querySelector('#workshop-log');
    const row = document.createElement('div');
    row.className = 'mods-file-row' + (cls ? ` ${cls}` : '');
    row.textContent = text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  async function install() {
    if (installing) return;

    const input = container.querySelector('#workshop-input').value.trim();
    if (!input) return;

    installing = true;
    const btn = container.querySelector('#btn-install-workshop');
    const fill = container.querySelector('#workshop-progress-fill');
    const log = container.querySelector('#workshop-log');

    btn.disabled = true;
    fill.style.width = '0%';
    log.innerHTML = '';

    if (unsubscribeProgress) unsubscribeProgress();
    unsubscribeProgress = window.api.workshop.onProgress((payload) => {
      switch (payload.stage) {
        case 'steamcmd-setup':
          appendLog('Проверяем наличие SteamCMD…');
          break;
        case 'steamcmd-downloading':
          appendLog('Скачиваем SteamCMD…');
          fill.style.width = '10%';
          break;
        case 'steamcmd-extracting':
          appendLog('Распаковываем SteamCMD…');
          fill.style.width = '20%';
          break;
        case 'downloading':
          appendLog(`Скачиваем мод (Workshop ID ${payload.workshopId})…`);
          fill.style.width = '45%';
          break;
        case 'copying':
          appendLog(`Копируем файлы в addons (${payload.total})…`);
          fill.style.width = '85%';
          break;
        case 'file-complete': {
          const pct = 85 + Math.round((payload.done / payload.total) * 15);
          fill.style.width = `${pct}%`;
          appendLog(`✓ ${payload.file}`, 'is-done');
          break;
        }
        case 'complete':
          fill.style.width = '100%';
          break;
        // 'log' — сырой вывод steamcmd, не показываем построчно в UI, чтобы
        // не засорять список служебными сообщениями Steam.
        default:
          break;
      }
    });

    try {
      const result = await window.api.workshop.install(input);
      appendLog(`Готово: установлено файлов — ${result.installed.length}.`, 'is-done');
      appendLog(`Папка: ${result.addonsDir}`);
    } catch (err) {
      appendLog(`Ошибка: ${String(err.message || err)}`);
      fill.style.width = '0%';
    } finally {
      installing = false;
      btn.disabled = false;
      if (unsubscribeProgress) {
        unsubscribeProgress();
        unsubscribeProgress = null;
      }
    }
  }

  return { mount };
})();
