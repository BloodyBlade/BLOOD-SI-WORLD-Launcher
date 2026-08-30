// ---------------------------------------------------------------------------
// Общее состояние, доступное всем страницам (servers.js читает/пишет через
// window.AppState, а не через прямой доступ друг к другу).
// ---------------------------------------------------------------------------
window.AppState = (() => {
  let selectedServer = null;

  function selectServer(server) {
    selectedServer = server;
    const label = document.getElementById('play-bar-server');
    label.textContent = server.status && server.status.online
      ? `${server.name} — ${server.status.map} (${server.status.players}/${server.status.maxPlayers})`
      : `${server.name} (офлайн)`;
  }

  async function launch() {
    const playBtn = document.getElementById('btn-play');
    const optionsInput = document.getElementById('launch-options');
    const statusEl = document.getElementById('play-bar-status');

    // Кастомные параметры из play-bar перекрывают дефолт из настроек на
    // время этого запуска.
    if (optionsInput.value.trim()) {
      await window.api.config.set({ launchOptions: optionsInput.value.trim() });
    }

    statusEl.hidden = true;
    playBtn.disabled = true;
    playBtn.querySelector('.play-button-label').textContent = 'ЗАПУСК…';

    try {
      const result = await window.api.game.launch(
        selectedServer ? { connectIp: selectedServer.ip, connectPort: selectedServer.port } : {}
      );

      if (!result || !result.ok) {
        showStatus(
          statusEl,
          `Не удалось запустить игру: ${result?.error || 'неизвестная ошибка'}. ` +
          'Проверьте путь к left4dead2.exe во вкладке «Настройки».',
          true
        );
      } else if (result.mode === 'steam') {
        showStatus(
          statusEl,
          'Путь к игре не задан — запуск идёт через Steam. ' +
          'Если ничего не открылось, убедитесь, что Steam запущен и игра установлена, ' +
          'либо укажите путь к left4dead2.exe в «Настройках» для прямого запуска.',
          false
        );
      }
      // result.mode === 'exe' и ok:true — процесс успешно стартовал, статус не показываем.
      // Учтите: у Source-движка первая загрузка (сборка кэша шейдеров) может
      // занимать до минуты — это не зависание лаунчера, окно игры просто
      // появится не сразу.
    } catch (err) {
      showStatus(statusEl, `Ошибка запуска: ${String(err.message || err)}`, true);
    } finally {
      setTimeout(() => {
        playBtn.disabled = false;
        playBtn.querySelector('.play-button-label').textContent = 'ИГРАТЬ';
      }, 1500);
    }
  }

  function showStatus(el, text, isError) {
    el.textContent = text;
    el.classList.toggle('is-error', Boolean(isError));
    el.hidden = false;
  }

  return { selectServer, launch, get selectedServer() { return selectedServer; } };
})();

// ---------------------------------------------------------------------------
// Роутер вкладок
// ---------------------------------------------------------------------------
function mountPage(name) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.page === name);
  });

  const content = document.getElementById('content');
  const page = window.Pages[name];
  if (!page) {
    content.innerHTML = `<div class="empty-state">Страница «${name}» не найдена.</div>`;
    return;
  }
  page.mount(content);
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => mountPage(btn.dataset.page));
});

// ---------------------------------------------------------------------------
// Титлбар
// ---------------------------------------------------------------------------
document.getElementById('btn-min').addEventListener('click', () => window.api.window.minimize());
document.getElementById('btn-close').addEventListener('click', () => window.api.window.close());

// ---------------------------------------------------------------------------
// Карточка игрока (никнейм)
//
// По умолчанию поле заблокировано (просто показывает текущий ник).
// Кнопка-карандаш включает редактирование; сохранение — по Enter или
// потере фокуса. Пустой ник заменяется дефолтным на стороне main.js.
// ---------------------------------------------------------------------------
(function initPlayerCard() {
  const input = document.getElementById('player-nickname');
  const editBtn = document.getElementById('player-card-edit');

  function enterEditMode() {
    input.classList.add('is-editing');
    input.focus();
    input.select();
  }

  async function commitNickname() {
    input.classList.remove('is-editing');
    const saved = await window.api.player.setNickname(input.value);
    input.value = saved; // подхватываем дефолт, если поле было очищено
  }

  window.api.player.getNickname().then((nickname) => {
    input.value = nickname;
  });

  editBtn.addEventListener('click', enterEditMode);

  input.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') input.blur();
    if (evt.key === 'Escape') {
      input.classList.remove('is-editing');
      window.api.player.getNickname().then((nickname) => {
        input.value = nickname;
        input.blur();
      });
    }
  });

  input.addEventListener('blur', () => {
    if (input.classList.contains('is-editing')) commitNickname();
  });
})();

// ---------------------------------------------------------------------------
// Play bar
// ---------------------------------------------------------------------------
document.getElementById('btn-play').addEventListener('click', () => window.AppState.launch());

window.api.config.get().then((cfg) => {
  document.getElementById('launch-options').value = cfg.launchOptions || '';
});

// ---------------------------------------------------------------------------
// Старт: открываем список серверов
// ---------------------------------------------------------------------------
mountPage('servers');

// Фоновая проверка модов на старте — не блокирует UI, просто обновляет
// точку статуса в сайдбаре.
window.Pages.mods.checkSidebarStatus().catch(() => {});
