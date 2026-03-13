// ─── State ───────────────────────────────────────────────
let allArticles = [];
let filteredArticles = [];
let displayedCount = 24;
const PAGE_SIZE = 24;

let currentSearch = '';
let currentSource = 'all';
let currentCategory = 'all';
let currentCopilotType = 'all';
let currentSort = 'date';
let searchTimeout = null;

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadArticles();
  loadSummary();
  // Auto-refresh elke 30 minuten
  setInterval(loadArticles, 30 * 60 * 1000);
  setInterval(loadSummary, 30 * 60 * 1000);
});

// ─── Samenvatting ─────────────────────────────────────────
async function loadSummary(manual = false) {
  const body = document.getElementById('summaryBody');
  const footer = document.getElementById('summaryFooter');
  const btn = document.getElementById('summaryRefreshBtn');

  if (manual) {
    btn.classList.add('spinning');
    body.innerHTML = `<div class="summary-loading"><span class="summary-dot-anim"></span> Samenvatting genereren…</div>`;
    footer.innerHTML = '';
  }

  try {
    const res = await fetch('/api/summary');
    if (!res.ok) throw new Error('Fout');
    const data = await res.json();

    // Markeer bedrijfsnamen en trefwoorden vetgedrukt
    const highlights = [
      'OpenAI','Google','Microsoft','Meta','Anthropic','Apple','Amazon','NVIDIA',
      'DeepMind','xAI','Mistral','Cohere','Hugging Face','ChatGPT','Gemini','Claude',
      'Grok','Llama','LLM','AGI','GPT'
    ];
    let text = escapeHtml(data.summary);
    highlights.forEach(word => {
      const regex = new RegExp(`\\b(${word})\\b`, 'g');
      text = text.replace(regex, '<em>$1</em>');
    });

    body.innerHTML = `<p class="summary-text">${text}</p>`;

    const genTime = data.generatedAt
      ? new Date(data.generatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      : '';
    footer.innerHTML = `
      <span class="summary-count-badge">📰 ${data.count} artikelen</span>
      ${genTime ? `Gegenereerd om ${genTime}` : ''}
    `;
  } catch {
    body.innerHTML = `<span style="color:var(--text3);font-size:0.85rem">Samenvatting kon niet worden geladen.</span>`;
  } finally {
    btn.classList.remove('spinning');
  }
}

// ─── Data laden ───────────────────────────────────────────
async function loadArticles() {
  showLoading(true);
  hideError();
  hideEmpty();

  try {
    const params = new URLSearchParams({
      limit: 200,
      ...(currentSearch ? { search: currentSearch } : {}),
      ...(currentSource !== 'all' ? { source: currentSource } : {}),
      ...(currentCategory !== 'all' ? { category: currentCategory } : {})
    });

    const response = await fetch(`/api/articles?${params}`);
    if (!response.ok) throw new Error('Server fout');

    const data = await response.json();
    allArticles = data.articles;

    // Vul bron-dropdown
    populateSourceSelect(data.sources);

    // Update statistieken
    updateStats(data);

    // Verwerk en toon artikelen
    applyFiltersAndRender();
    showLoading(false);
  } catch (err) {
    console.error('Fout:', err);
    showLoading(false);
    showError();
  }
}

async function refreshArticles() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.classList.add('spinning');

  try {
    await fetch('/api/refresh');
    await loadArticles();
  } catch (err) {
    console.error('Vernieuwen mislukt:', err);
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
  }
}

// ─── Filteren & Renderen ───────────────────────────────────
function applyFiltersAndRender() {
  let articles = [...allArticles];

  // Zoeken (client-side)
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    articles = articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q)
    );
  }

  // Bron filter
  if (currentSource !== 'all') {
    articles = articles.filter(a => a.source === currentSource);
  }

  // Categorie filter
  if (currentCategory !== 'all') {
    articles = articles.filter(a => a.category === currentCategory);
  }

  // Copilot sub-filter (zakelijk / consument)
  if (currentCategory === 'Copilot' && currentCopilotType !== 'all') {
    if (currentCopilotType === 'zakelijk') {
      articles = articles.filter(a => a.copilotType === 'zakelijk');
    } else if (currentCopilotType === 'consument') {
      articles = articles.filter(a => a.copilotType === 'consument');
    }
  }

  // Sortering
  if (currentSort === 'source') {
    articles.sort((a, b) => a.source.localeCompare(b.source));
  } else {
    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  filteredArticles = articles;
  displayedCount = PAGE_SIZE;
  renderArticles();
  updateArticleCount();
}

function renderArticles() {
  const grid = document.getElementById('articlesGrid');
  const loadMoreWrapper = document.getElementById('loadMoreWrapper');

  if (filteredArticles.length === 0) {
    grid.innerHTML = '';
    showEmpty();
    loadMoreWrapper.style.display = 'none';
    return;
  }

  hideEmpty();
  const toShow = filteredArticles.slice(0, displayedCount);
  grid.innerHTML = toShow.map(a => createCardHTML(a)).join('');

  // Load more knop
  if (filteredArticles.length > displayedCount) {
    loadMoreWrapper.style.display = 'flex';
    document.getElementById('loadMoreBtn').textContent =
      `Meer laden (${filteredArticles.length - displayedCount} resterend)`;
  } else {
    loadMoreWrapper.style.display = 'none';
  }
}

function loadMore() {
  displayedCount += PAGE_SIZE;
  renderArticles();
  // Scroll naar het einde van de huidige artikelen
}

// ─── Card HTML ─────────────────────────────────────────────
function createCardHTML(article) {
  const isNew = isNewArticle(article.publishedAt);
  const dateStr = formatDate(article.publishedAt);
  const badgeStyle = `background:${article.sourceColor || '#6366f1'}`;
  const isWP = article.isWhitepaper;
  const isCP = article.category === 'Copilot';
  const isPub = article.isPublicatie || article.category === 'Publicaties';

  // Copilot type badge
  let copilotBadgeHTML = '';
  if (isCP) {
    if (article.copilotType === 'zakelijk') {
      copilotBadgeHTML = '<span class="copilot-type-badge copilot-zakelijk">💼 Zakelijk</span>';
    } else if (article.copilotType === 'consument') {
      copilotBadgeHTML = '<span class="copilot-type-badge copilot-consument">🖥️ Consument</span>';
    } else {
      copilotBadgeHTML = '<span class="copilot-type-badge copilot-algemeen">🪟 Copilot</span>';
    }
  }

  const publicatieBadgeHTML = isPub
    ? `<span class="publicatie-badge">📚 Publicatie</span>` : '';

  const imageSection = (!isWP && article.image)
    ? `<div class="card-image-container" style="overflow:hidden">
         <img class="card-image" src="${escapeHtml(article.image)}"
              alt="" loading="lazy"
              onerror="this.parentElement.innerHTML='<div class=\\'card-image-placeholder\\'>📄</div>'" />
       </div>`
    : isWP
      ? `<div class="card-image-placeholder" style="font-size:2.5rem;height:100px">📄</div>`
      : `<div class="card-image-placeholder">🤖</div>`;

  const authorsHTML = isWP && article.authors
    ? `<p class="card-authors">✍️ ${escapeHtml(article.authors)}</p>` : '';

  const footerRight = isWP && article.pdfUrl
    ? `<button class="btn-read-paper" onclick="event.stopPropagation();readPaper('${escapeAttr(article.id)}')">
         📖 Lees paper
       </button>`
    : `<span class="card-read-link">Lees meer <span class="card-arrow">→</span></span>`;

  return `
    <div class="card ${isNew ? 'new-article' : ''} ${isWP ? 'whitepaper-card' : ''} ${isCP ? 'copilot-card' : ''} ${isPub ? 'publicatie-card' : ''}"
         onclick="openModal('${escapeAttr(article.id)}')"
         data-id="${escapeAttr(article.id)}">
      ${imageSection}
      <div class="card-body">
        <div class="card-meta">
          <div class="card-source">
            <span class="source-badge" style="${badgeStyle}">${escapeHtml(article.sourceLogo)}</span>
            <span style="font-size:0.75rem;color:var(--text2);font-weight:500">${escapeHtml(article.source)}</span>
            ${isWP ? '<span class="whitepaper-badge">📄 Whitepaper</span>' : ''}
            ${publicatieBadgeHTML}
            ${copilotBadgeHTML}
          </div>
          <div style="display:flex;align-items:center;gap:0.4rem">
            ${isNew ? '<span class="new-badge">Nieuw</span>' : ''}
            <span class="card-date">${dateStr}</span>
          </div>
        </div>
        <h2 class="card-title">${escapeHtml(article.title)}</h2>
        ${authorsHTML}
        <p class="card-description">${escapeHtml(article.description)}</p>
        <div class="card-footer">
          <span class="card-category">${escapeHtml(article.category)}</span>
          ${footerRight}
        </div>
      </div>
    </div>`;
}

// ─── Modal ─────────────────────────────────────────────────
function openModal(articleId) {
  const article = filteredArticles.find(a => a.id === articleId);
  if (!article) return;

  const dateStr = formatDateFull(article.publishedAt);
  const badgeStyle = `background:${article.sourceColor || '#6366f1'}`;
  const isWP = article.isWhitepaper;

  const imageHTML = (!isWP && article.image)
    ? `<img class="modal-image" src="${escapeHtml(article.image)}" alt="" onerror="this.remove()" />`
    : '';

  const authorsHTML = isWP && article.authors
    ? `<p style="font-size:0.82rem;color:var(--text3);margin-bottom:0.75rem">✍️ ${escapeHtml(article.authors)}</p>`
    : '';

  const paperBtn = isWP && article.pdfUrl
    ? `<button class="btn-read-paper" id="paperReadBtn"
         onclick="readPaper('${escapeAttr(article.id)}')" style="margin-right:0.75rem">
         📖 Whitepaper samenvatten
       </button>`
    : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-source">
      <span class="source-badge" style="${badgeStyle}">${escapeHtml(article.sourceLogo)}</span>
      <span style="font-weight:600">${escapeHtml(article.source)}</span>
      ${isWP ? '<span class="whitepaper-badge">📄 Whitepaper</span>' : `<span class="card-category">${escapeHtml(article.category)}</span>`}
    </div>
    ${imageHTML}
    <h2 class="modal-title">${escapeHtml(article.title)}</h2>
    ${authorsHTML}
    <div class="modal-meta">
      <span class="modal-date">📅 ${dateStr}</span>
    </div>
    <p class="modal-description">${escapeHtml(article.description)}</p>
    <div id="paperSummaryArea"></div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-top:1.5rem">
      ${paperBtn}
      <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer"
         class="modal-btn" onclick="event.stopPropagation()">
        ${isWP ? 'Volledige paper lezen ↗' : 'Volledig artikel lezen ↗'}
      </a>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ─── Paper lezen (PDF samenvatten) ────────────────────────
async function readPaper(articleId) {
  const article = filteredArticles.find(a => a.id === articleId) ||
                  allArticles.find(a => a.id === articleId);
  if (!article || !article.pdfUrl) return;

  const area = document.getElementById('paperSummaryArea');
  const btn = document.getElementById('paperReadBtn');
  if (!area) return;

  if (btn) { btn.disabled = true; btn.textContent = '⏳ PDF laden…'; }
  area.innerHTML = `<div class="paper-loading"><span class="summary-dot-anim"></span> Whitepaper wordt gelezen en samengevat…</div>`;

  try {
    const params = new URLSearchParams({ url: article.pdfUrl, title: article.title });
    const res = await fetch(`/api/paper-summary?${params}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Onbekende fout');

    // Render de samenvatting met basis markdown (** en \n)
    let html = escapeHtml(data.summary)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p style="margin-top:0.75rem">')
      .replace(/\n/g, '<br>');

    area.innerHTML = `
      <div class="paper-summary-box">
        <strong>📋 Samenvatting (${data.pages || '?'} pagina's gelezen)</strong>
        <p>${html}</p>
      </div>`;
    if (btn) { btn.textContent = '✓ Gelezen'; }
  } catch (err) {
    area.innerHTML = `<div class="paper-summary-box" style="border-color:rgba(239,68,68,0.3);color:var(--text3)">
      ⚠️ PDF kon niet worden geladen: ${escapeHtml(err.message)}.<br>
      <a href="${escapeHtml(article.pdfUrl)}" target="_blank" rel="noopener noreferrer"
         style="color:var(--accent2)">Open PDF direct ↗</a>
    </div>`;
    if (btn) { btn.disabled = false; btn.textContent = '📖 Opnieuw proberen'; }
  }
}

function closeModal(event, force = false) {
  if (force || (event && event.target === document.getElementById('modalOverlay'))) {
    document.getElementById('modalOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal(null, true);
});

// ─── Filters ───────────────────────────────────────────────
function handleSearch(value) {
  clearTimeout(searchTimeout);
  const clearBtn = document.getElementById('searchClear');
  clearBtn.style.display = value ? 'block' : 'none';

  searchTimeout = setTimeout(() => {
    currentSearch = value.trim();
    applyFiltersAndRender();
  }, 300);
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  document.getElementById('searchClear').style.display = 'none';
  currentSearch = '';
  applyFiltersAndRender();
  input.focus();
}

function setCategory(category, btn) {
  currentCategory = category;
  currentCopilotType = 'all';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Toon/verberg Copilot sub-filter
  const subfilter = document.getElementById('copilotSubfilter');
  if (subfilter) {
    subfilter.style.display = category === 'Copilot' ? 'block' : 'none';
    // Reset sub-tabs
    document.querySelectorAll('.copilot-sub-tab').forEach(t => t.classList.remove('active'));
    const first = document.querySelector('.copilot-sub-tab');
    if (first) first.classList.add('active');
  }

  applyFiltersAndRender();
}

function setCopilotType(type, btn) {
  currentCopilotType = type;
  document.querySelectorAll('.copilot-sub-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  applyFiltersAndRender();
}

function setSource(value) {
  currentSource = value;
  applyFiltersAndRender();
}

function setSort(value) {
  currentSort = value;
  applyFiltersAndRender();
}

function populateSourceSelect(sources) {
  const select = document.getElementById('sourceSelect');
  const currentValue = select.value;

  // Behoud huidige selectie
  const existing = new Set(
    Array.from(select.options).map(o => o.value)
  );

  sources.forEach(s => {
    if (!existing.has(s.name)) {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
  });

  if (currentValue) select.value = currentValue;
}

// ─── Stats & UI helpers ────────────────────────────────────
function updateStats(data) {
  const lastUpdated = document.getElementById('lastUpdated');
  if (data.lastUpdated) {
    const d = new Date(data.lastUpdated);
    lastUpdated.textContent = `Bijgewerkt: ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  document.getElementById('sourceCount').textContent =
    `${data.sources ? data.sources.length : '?'} bronnen`;
}

function updateArticleCount() {
  document.getElementById('articleCount').textContent =
    `${filteredArticles.length} artikelen`;
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
  document.getElementById('articlesGrid').style.display = show ? 'none' : 'grid';
}

function showError() {
  document.getElementById('errorState').style.display = 'flex';
  document.getElementById('articlesGrid').style.display = 'none';
}

function hideError() {
  document.getElementById('errorState').style.display = 'none';
}

function showEmpty() {
  document.getElementById('emptyState').style.display = 'flex';
}

function hideEmpty() {
  document.getElementById('emptyState').style.display = 'none';
}

// ─── Datum helpers ─────────────────────────────────────────
function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return 'Onbekend';

  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${mins}m geleden`;
  if (hours < 24) return `${hours}u geleden`;
  if (days < 7) return `${days}d geleden`;

  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return 'Onbekend';
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function isNewArticle(dateStr) {
  const date = new Date(dateStr);
  const hours24 = 24 * 60 * 60 * 1000;
  return (new Date() - date) < hours24;
}

// ─── Veiligheid helpers ────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/['"<>&]/g, c => ({
    "'": '&#039;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '&': '&amp;'
  }[c]));
}
