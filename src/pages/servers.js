window.Pages = window.Pages || {};

window.Pages.servers = (() => {
  let container;

  async function mount(el) {
    container = el;
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Серверы</h1>
        <span class="hazard-stripe"></span>
      </div>
      <div class="page-subtitle" id="servers-subtitle">опрос...</div>

      <div class="toolbar">
        <button class="btn" id="btn-refresh-servers">Обновить</button>
        <button class="btn" id="btn-add-server">+ Добавить сервер</button>
      </div>

      <div class="server-list" id="server-list"></div>
    `;

    container.querySelector('#btn-refresh-servers').addEventListener('click', refresh);
    container.querySelector('#btn-add-server').addEventListener('click', openAddServerModal);
    initAddServerModal();

    await refresh();
  }

  async function refresh() {
    const listEl = container.querySelector('#server-list');
    const subtitleEl = container.querySelector('#servers-subtitle');
    subtitleEl.textContent = 'опрашиваем серверы…';

    const results = await window.api.servers.queryAll();

    if (results.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Список серверов пуст. Добавьте сервер кнопкой выше.</div>`;
      subtitleEl.textContent = '0 серверов в списке';
      return;
    }

    const online = results.filter(r => r.status.online).length;
    subtitleEl.textContent = `${online} / ${results.length} онлайн`;

    listEl.innerHTML = '';
    results.forEach((server, index) => {
      const row = buildRow(server, index);
      listEl.appendChild(row);
    });
  }

  function buildRow(server, index) {
    const tpl = document.getElementById('tpl-server-row');
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector('.server-row');
    const dot = node.querySelector('.dot');
    const nameEl = node.querySelector('.server-row-name');
    const mapEl = node.querySelector('.server-row-map');
    const playersEl = node.querySelector('.server-row-players');
    const pingEl = node.querySelector('.server-row-ping');
    const connectBtn = node.querySelector('.server-row-connect');

    const { status } = server;

    if (status.online) {
      dot.classList.add('dot-online');
      nameEl.textContent = status.name || server.name;
      mapEl.textContent = status.map || '—';
      playersEl.textContent = `${status.players}/${status.maxPlayers}`;
      pingEl.textContent = `${status.ping} ms`;
    } else {
      dot.classList.add('dot-offline');
      nameEl.textContent = server.name;
      mapEl.textContent = 'офлайн';
      playersEl.textContent = '—';
      pingEl.textContent = '—';
    }

    row.addEventListener('click', () => {
      window.AppState.selectServer(server);
      container.querySelectorAll('.server-row').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');
    });

    connectBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      window.AppState.selectServer(server);
      window.AppState.launch();
    });

    const removeBtn = node.querySelector('.server-row-remove');
    removeBtn.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      await window.api.servers.remove(index);
      await refresh();
    });

    // Не показываем кнопку подключения для мёртвых серверов — нечего.
    if (!status.online) connectBtn.style.display = 'none';

    return row;
  }

  // ---------------------------------------------------------------------------
  // Модалка «Добавить сервер» — обычная форма, а не window.prompt(): в
  // Electron нативные prompt()/alert() ненадёжны (могут вообще не
  // показаться при включённой изоляции контекста, или всплыть за окном
  // приложения), поэтому используем свою разметку из index.html.
  // ---------------------------------------------------------------------------
  function initAddServerModal() {
    const overlay = document.getElementById('add-server-overlay');
    if (overlay.dataset.initialized) return; // разметка общая на всё приложение — вешаем слушатели один раз
    overlay.dataset.initialized = '1';

    const nameInput = document.getElementById('add-server-name');
    const ipInput = document.getElementById('add-server-ip');
    const portInput = document.getElementById('add-server-port');
    const errorEl = document.getElementById('add-server-error');

    function close() {
      overlay.hidden = true;
      nameInput.value = '';
      ipInput.value = '';
      portInput.value = '27015';
      errorEl.hidden = true;
    }

    function showError(text) {
      errorEl.textContent = text;
      errorEl.classList.add('is-error');
      errorEl.hidden = false;
    }

    async function submit() {
      const name = nameInput.value.trim();
      const ip = ipInput.value.trim();
      const port = parseInt(portInput.value.trim(), 10);

      if (!name) return showError('Укажите название сервера.');

      // Простая валидация IPv4 (x.x.x.x) или доменного имени — этого
      // достаточно, чтобы отсечь явный мусор до отправки в main-процесс.
      const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
      const isHostname = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(ip);
      if (!ip || (!isIpv4 && !isHostname)) {
        return showError('Укажите корректный IP-адрес (например, 127.0.0.1) или домен сервера.');
      }
      if (isIpv4 && ip.split('.').some((octet) => Number(octet) > 255)) {
        return showError('Каждый октет IP-адреса должен быть от 0 до 255.');
      }
      if (!port || port < 1 || port > 65535) {
        return showError('Порт должен быть числом от 1 до 65535.');
      }

      await window.api.servers.add({ name, ip, port });
      close();
      await refresh();
    }

    document.getElementById('add-server-cancel').addEventListener('click', close);
    document.getElementById('add-server-submit').addEventListener('click', submit);

    // Enter в любом поле формы — тоже отправка, Escape — закрыть.
    overlay.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') submit();
      if (evt.key === 'Escape') close();
    });

    // Клик по тёмной подложке — закрыть, как в большинстве модалок.
    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) close();
    });
  }

  function openAddServerModal() {
    const overlay = document.getElementById('add-server-overlay');
    overlay.hidden = false;
    document.getElementById('add-server-name').focus();
  }

  return { mount };
})();
