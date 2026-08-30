window.Pages = window.Pages || {};

window.Pages.mods = (() => {
  let container;
  let unsubscribeProgress = null;

  async function mount(el) {
    container = el;
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Моды</h1>
        <span class="hazard-stripe"></span>
      </div>
      <div class="page-subtitle">клиентские аддоны и плагины проекта</div>

      <div class="mods-summary">
        <div class="mods-stat">
          <div class="mods-stat-value" id="mods-total">—</div>
          <div class="mods-stat-label">Всего файлов</div>
        </div>
        <div class="mods-stat">
          <div class="mods-stat-value" id="mods-outdated">—</div>
          <div class="mods-stat-label">Требуют обновления</div>
        </div>
        <div class="mods-stat">
          <div class="mods-stat-value" id="mods-version">—</div>
          <div class="mods-stat-label">Версия набора</div>
        </div>
      </div>

      <div class="toolbar">
        <button class="btn" id="btn-check-mods">Проверить</button>
        <button class="btn btn-primary" id="btn-update-mods" disabled>Обновить</button>
      </div>

      <div class="progress-track"><div class="progress-fill" id="mods-progress-fill"></div></div>

      <div class="mods-file-list" id="mods-file-list">
        <div class="mods-file-row">Нажмите «Проверить», чтобы сверить файлы с манифестом.</div>
      </div>
    `;

    container.querySelector('#btn-check-mods').addEventListener('click', check);
    container.querySelector('#btn-update-mods').addEventListener('click', update);

    await check();
  }

  async function check() {
    setSidebar('unknown', 'Проверка модов…');
    const listEl = container.querySelector('#mods-file-list');
    listEl.innerHTML = `<div class="mods-file-row">Проверяем манифест…</div>`;

    try {
      const result = await window.api.mods.check();

      container.querySelector('#mods-total').textContent = result.total;
      container.querySelector('#mods-outdated').textContent = result.toUpdate.length;
      container.querySelector('#mods-version').textContent = result.version || '—';

      const updateBtn = container.querySelector('#btn-update-mods');
      updateBtn.disabled = result.toUpdate.length === 0;

      if (result.toUpdate.length === 0) {
        listEl.innerHTML = `<div class="mods-file-row is-done">Все файлы актуальны.</div>`;
        setSidebar('online', 'Моды актуальны');
      } else {
        listEl.innerHTML = '';
        result.toUpdate.forEach(f => {
          const row = document.createElement('div');
          row.className = 'mods-file-row';
          row.textContent = f.path;
          listEl.appendChild(row);
        });
        setSidebar('offline', `Нужно обновить: ${result.toUpdate.length}`);
      }
    } catch (err) {
      listEl.innerHTML = `<div class="mods-file-row">Ошибка проверки: ${escapeHtml(String(err.message || err))}</div>`;
      setSidebar('offline', 'Ошибка проверки модов');
    }
  }

  async function update() {
    const updateBtn = container.querySelector('#btn-update-mods');
    const checkBtn = container.querySelector('#btn-check-mods');
    const fill = container.querySelector('#mods-progress-fill');
    const listEl = container.querySelector('#mods-file-list');

    updateBtn.disabled = true;
    checkBtn.disabled = true;
    listEl.innerHTML = '';

    const rows = new Map();

    if (unsubscribeProgress) unsubscribeProgress();
    unsubscribeProgress = window.api.mods.onProgress((payload) => {
      if (payload.stage === 'complete') {
        fill.style.width = '100%';
        return;
      }

      let row = rows.get(payload.file);
      if (!row) {
        row = document.createElement('div');
        row.className = 'mods-file-row is-active';
        listEl.appendChild(row);
        rows.set(payload.file, row);
      }

      if (payload.stage === 'downloading') {
        row.textContent = `↓ ${payload.file}`;
      } else if (payload.stage === 'progress') {
        const pct = payload.fileTotal ? Math.round((payload.received / payload.fileTotal) * 100) : 0;
        row.textContent = `↓ ${payload.file} — ${pct}%`;
      } else if (payload.stage === 'file-complete') {
        row.textContent = `✓ ${payload.file}`;
        row.classList.remove('is-active');
        row.classList.add('is-done');
      }

      const overall = payload.total ? Math.round((payload.done / payload.total) * 100) : 0;
      fill.style.width = `${overall}%`;
    });

    try {
      await window.api.mods.update();
      setSidebar('online', 'Моды обновлены');
    } catch (err) {
      listEl.insertAdjacentHTML('beforeend', `<div class="mods-file-row">Ошибка: ${escapeHtml(String(err.message || err))}</div>`);
      setSidebar('offline', 'Ошибка обновления');
    } finally {
      checkBtn.disabled = false;
      await check();
    }
  }

  function setSidebar(state, text) {
    const dot = document.getElementById('sidebar-mod-dot');
    const label = document.getElementById('sidebar-mod-text');
    dot.className = 'dot ' + (state === 'online' ? 'dot-online' : state === 'offline' ? 'dot-offline' : 'dot-unknown');
    label.textContent = text;
  }

  // Фоновая проверка при старте приложения — только обновляет точку в
  // сайдбаре, не трогает контент страницы (страница mods ещё не смонтирована).
  async function checkSidebarStatus() {
    setSidebar('unknown', 'Проверка модов…');
    try {
      const result = await window.api.mods.check();
      if (result.toUpdate.length === 0) {
        setSidebar('online', 'Моды актуальны');
      } else {
        setSidebar('offline', `Нужно обновить: ${result.toUpdate.length}`);
      }
    } catch (err) {
      setSidebar('offline', 'Ошибка проверки модов');
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { mount, checkSidebarStatus };
})();
