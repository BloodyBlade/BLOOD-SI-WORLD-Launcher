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
    container.querySelector('#btn-add-server').addEventListener('click', addServerPrompt);

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

    // Не показываем кнопку подключения для мёртвых серверов — нечего.
    if (!status.online) connectBtn.style.display = 'none';

    return row;
  }

  async function addServerPrompt() {
    const name = prompt('Название сервера:');
    if (!name) return;
    const address = prompt('Адрес (ip:port):', '127.0.0.1:27015');
    if (!address) return;
    const [ip, portStr] = address.split(':');
    const port = parseInt(portStr, 10) || 27015;

    await window.api.servers.add({ name, ip, port });
    await refresh();
  }

  return { mount };
})();
