window.Pages = window.Pages || {};

window.Pages.news = (() => {
  async function mount(container) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Новости</h1>
        <span class="hazard-stripe"></span>
      </div>
      <div class="page-subtitle">чейнджлог проекта</div>
      <div id="news-list"><div class="empty-state">Загрузка…</div></div>
    `;

    const listEl = container.querySelector('#news-list');

    try {
      const entries = await window.api.news.fetch();

      if (!entries || entries.length === 0) {
        listEl.innerHTML = `<div class="empty-state">Пока новостей нет.</div>`;
        return;
      }

      listEl.innerHTML = '';
      entries
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .forEach((entry) => {
          const el = document.createElement('div');
          el.className = 'news-entry';
          el.innerHTML = `
            <div class="news-entry-date">${escapeHtml(entry.date || '')}</div>
            <div class="news-entry-title">${escapeHtml(entry.title || '')}</div>
            <div class="news-entry-body">${escapeHtml(entry.body || '')}</div>
          `;
          listEl.appendChild(el);
        });
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state">Не удалось загрузить новости: ${escapeHtml(String(err.message || err))}</div>`;
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { mount };
})();
