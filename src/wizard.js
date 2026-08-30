// ---------------------------------------------------------------------------
// Мастер установки — показывается один раз при первом запуске (пока в
// конфиге setupCompleted !== true). Пошагово: приветствие -> путь к игре ->
// никнейм -> готово. Ничего не устанавливает в систему — только заполняет
// конфиг лаунчера (gamePath, playerNickname) через уже существующие IPC.
// ---------------------------------------------------------------------------
window.Wizard = (() => {
  const overlay = document.getElementById('wizard-overlay');
  let chosenGamePath = '';

  function showStep(name) {
    overlay.querySelectorAll('.wizard-step').forEach((step) => {
      step.classList.toggle('is-active', step.dataset.step === name);
    });
  }

  async function runAutoDetect() {
    const hint = document.getElementById('wizard-gamepath-hint');
    const pathInput = document.getElementById('wizard-game-path');
    hint.textContent = 'Ищем автоматически по стандартным путям Steam…';

    try {
      const found = await window.api.setup.autoDetectGamePath();
      if (found) {
        chosenGamePath = found;
        pathInput.value = found;
        hint.textContent = 'Найдено автоматически. Если это не та копия игры — нажмите «Обзор…».';
      } else {
        hint.textContent = 'Не нашли автоматически — укажите left4dead2.exe вручную через «Обзор…».';
      }
    } catch {
      hint.textContent = 'Не удалось выполнить автопоиск — укажите путь вручную через «Обзор…».';
    }
  }

  async function init() {
    const alreadyDone = await window.api.setup.isCompleted();
    if (alreadyDone) return;

    overlay.hidden = false;

    // Предзаполняем ник текущим/дефолтным значением, чтобы шаг 3 не был пустым.
    window.api.player.getNickname().then((nickname) => {
      document.getElementById('wizard-nickname').value = nickname;
    });

    overlay.querySelectorAll('.wizard-next').forEach((btn) => {
      btn.addEventListener('click', () => showStep(btn.dataset.goto));
    });

    document.getElementById('wizard-btn-autodetect').addEventListener('click', runAutoDetect);

    document.getElementById('wizard-btn-browse').addEventListener('click', async () => {
      const picked = await window.api.config.browseGamePath();
      if (picked) {
        chosenGamePath = picked;
        document.getElementById('wizard-game-path').value = picked;
        document.getElementById('wizard-gamepath-hint').textContent = 'Путь выбран вручную.';
      }
    });

    // Переход на шаг "готово" — собираем сводку.
    overlay.querySelector('[data-goto="done"]').addEventListener('click', () => {
      const nickname = document.getElementById('wizard-nickname').value.trim();
      const summary = document.getElementById('wizard-summary');
      const pathLine = chosenGamePath
        ? `Игра: ${chosenGamePath}`
        : 'Путь к игре не указан — можно задать позже во вкладке «Настройки».';
      summary.innerHTML = `${pathLine}<br>Никнейм: ${nickname || '(будет сгенерирован автоматически)'}`;
    });

    document.getElementById('wizard-btn-finish').addEventListener('click', async () => {
      const nickname = document.getElementById('wizard-nickname').value.trim();
      await window.api.setup.complete({ gamePath: chosenGamePath, nickname });

      // Подтягиваем итоговый ник (если поле было пустым — подставится дефолт
      // из main.js) в уже смонтированную карточку игрока.
      const finalNickname = await window.api.player.getNickname();
      const nicknameInput = document.getElementById('player-nickname');
      if (nicknameInput) nicknameInput.value = finalNickname;

      overlay.hidden = true;
    });

    // Автопоиск запускаем сразу, чтобы к моменту, когда пользователь дойдёт
    // до шага 2, результат уже был готов.
    runAutoDetect();
  }

  return { init };
})();

window.Wizard.init();
