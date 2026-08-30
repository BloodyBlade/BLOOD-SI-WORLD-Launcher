window.Pages = window.Pages || {};

window.Pages.settings = (() => {
  async function mount(container) {
    const cfg = await window.api.config.get();

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Настройки</h1>
        <span class="hazard-stripe"></span>
      </div>
      <div class="page-subtitle">пути и источники данных лаунчера</div>

      <div class="field-group">
        <label class="field-label">Путь к left4dead2.exe</label>
        <div class="field-row">
          <input class="field-input" id="cfg-game-path" type="text" readonly value="${escapeAttr(cfg.gamePath || '')}">
          <button class="btn" id="btn-browse">Обзор…</button>
        </div>
        <div class="field-hint">Если не указан — запуск пойдёт через steam://run/550.</div>
      </div>

      <div class="field-group">
        <label class="field-label">Параметры запуска по умолчанию</label>
        <input class="field-input" id="cfg-launch-options" type="text" value="${escapeAttr(cfg.launchOptions || '')}">
      </div>

      <div class="field-group">
        <label class="field-label">URL манифеста модов (manifest.json)</label>
        <input class="field-input" id="cfg-manifest-url" type="text" value="${escapeAttr(cfg.manifestUrl || '')}">
      </div>

      <div class="field-group">
        <label class="field-label">URL новостей (news.json)</label>
        <input class="field-input" id="cfg-news-url" type="text" value="${escapeAttr(cfg.newsUrl || '')}">
      </div>

      <div class="toolbar">
        <button class="btn btn-primary" id="btn-save-settings">Сохранить</button>
      </div>
    `;

    container.querySelector('#btn-browse').addEventListener('click', async () => {
      const picked = await window.api.config.browseGamePath();
      if (picked) container.querySelector('#cfg-game-path').value = picked;
    });

    container.querySelector('#btn-save-settings').addEventListener('click', async () => {
      await window.api.config.set({
        launchOptions: container.querySelector('#cfg-launch-options').value,
        manifestUrl: container.querySelector('#cfg-manifest-url').value,
        newsUrl: container.querySelector('#cfg-news-url').value
      });
      const btn = container.querySelector('#btn-save-settings');
      const original = btn.textContent;
      btn.textContent = 'Сохранено ✓';
      setTimeout(() => (btn.textContent = original), 1200);
    });
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }

  return { mount };
})();
