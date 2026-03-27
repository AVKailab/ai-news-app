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
let currentDateFilter = 'all';
let searchTimeout = null;

// Opgeslagen artikelen (localStorage)
let savedArticleIds = new Set(JSON.parse(localStorage.getItem('avk_saved') || '[]'));
let savedNotes = JSON.parse(localStorage.getItem('avk_saved_notes') || '{}');
let pendingNoteArticleId = null;

// ─── Auth state ───────────────────────────────────────────
let currentUser = null; // { name, email, role } of null
const inviteToken = new URLSearchParams(window.location.search).get('invite');

// ─── Trainer-filter (opgeslagen per gebruiker) ────────────
let allUsersSavedMap = {}; // { 'Jan': Set(ids), 'Lisa': Set(ids) }
let selectedTrainer = 'all';

// Nieuwsbrief-selectie (localStorage)
let newsletterSelectedIds = new Set(JSON.parse(localStorage.getItem('avk_newsletter') || '[]'));

// Trending termen
const TRENDING_TERMS = [
  'ChatGPT','Gemini','Claude','Copilot','Grok','Sora','GPT-4','GPT-5',
  'OpenAI','Anthropic','Google','Microsoft','Meta','NVIDIA','Apple',
  'DeepSeek','Mistral','Llama','Perplexity','Agent','AGI','LLM',
  'RAG','Multimodal','Reasoning','Safety','Automation',
];

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Uitnodigingsregistratie: toon register-pagina en stop verdere init
  if (inviteToken) {
    await handleInviteFlow(inviteToken);
    return;
  }

  // Auth check — daarna normale app init
  await initAuth();

  initOnboarding();
  updateSavedCount();
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
    // Altijd alle artikelen ophalen — filtering gebeurt volledig client-side
    // (server-side filtering veroorzaakte bug: allArticles werd beperkt na refresh)
    const params = new URLSearchParams({ limit: 200 });

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
    updateTabBadges();
    renderTrendingTopics(allArticles);
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

  // Pseudo-categorie: opgeslagen artikelen
  if (currentCategory === 'saved') {
    if (selectedTrainer === 'all') {
      // "Iedereen" — toon alle opgeslagen van alle trainers
      if (Object.keys(allUsersSavedMap).length > 0) {
        const allSaved = new Set();
        Object.values(allUsersSavedMap).forEach(ids => ids.forEach(id => allSaved.add(id)));
        articles = articles.filter(a => allSaved.has(a.id));
      } else {
        articles = articles.filter(a => savedArticleIds.has(a.id));
      }
    } else if (allUsersSavedMap[selectedTrainer]) {
      // Specifieke trainer geselecteerd (ook de ingelogde gebruiker zelf)
      articles = articles.filter(a => allUsersSavedMap[selectedTrainer].has(a.id));
    } else {
      // Ingelogd maar nog geen server data — gebruik localStorage
      articles = articles.filter(a => savedArticleIds.has(a.id));
    }
  } else if (currentCategory === 'nl') {
    // Pseudo-categorie: Nederlandse bronnen
    articles = articles.filter(a => a.isNlSource);
  } else if (currentCategory === 'trainer') {
    // Pseudo-categorie: trainer-relevante artikelen (gebaseerd op AVK portfolio)
    articles = articles.filter(a => (a.trainerScore || 0) >= 1);
  } else if (currentCategory === 'newsletter') {
    // Pseudo-categorie: nieuwsbrief-view — alle artikelen (geen categorie-filter)
  } else if (currentCategory !== 'all') {
    articles = articles.filter(a => a.category === currentCategory);
  }

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

  // Datum filter
  if (currentDateFilter !== 'all') {
    const cutoffs = { '24h': 86400000, 'week': 604800000, 'month': 2592000000 };
    const cutoff = Date.now() - cutoffs[currentDateFilter];
    articles = articles.filter(a => new Date(a.publishedAt).getTime() >= cutoff);
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
  if (currentCategory === 'trainer' && currentSort !== 'source') {
    // Trainer-view: eerst op relevantie, dan op datum
    articles.sort((a, b) =>
      (b.trainerScore || 0) - (a.trainerScore || 0) ||
      new Date(b.publishedAt) - new Date(a.publishedAt)
    );
  } else if (currentSort === 'source') {
    articles.sort((a, b) => a.source.localeCompare(b.source));
  } else {
    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  filteredArticles = articles;
  displayedCount = PAGE_SIZE;

  if (currentCategory === 'newsletter') {
    renderNewsletter();
  } else {
    renderArticles();
  }
  updateArticleCount();
}

function renderArticles() {
  // Verberg nieuwsbrief-container als die zichtbaar was
  const nlContainer = document.getElementById('newsletterContainer');
  if (nlContainer) nlContainer.style.display = 'none';

  const grid = document.getElementById('articlesGrid');
  grid.style.display = 'grid';
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
  const isNl = article.isNlSource;
  const isSaved = savedArticleIds.has(article.id);
  const score = article.relevanceScore || 0;

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
  const nlBadgeHTML = isNl
    ? `<span class="nl-badge">🇳🇱</span>` : '';
  const relevanceHTML = score >= 4
    ? `<span class="rel-badge rel-high" title="Hoog relevant">🔥</span>`
    : score >= 2
      ? `<span class="rel-badge rel-med" title="AI-gerelateerd">⚡</span>`
      : '';

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

  const note = savedNotes[article.id];
  const noteHTML = note
    ? `<div class="card-note" onclick="event.stopPropagation();openNoteModal('${escapeAttr(article.id)}')" title="Klik om notitie te bewerken">📝 ${escapeHtml(note.length > 80 ? note.substring(0, 80) + '…' : note)}</div>`
    : '';

  const saveBtn = `<button class="btn-save${isSaved ? ' saved' : ''}"
    onclick="event.stopPropagation();toggleSaved('${escapeAttr(article.id)}', this)"
    title="${isSaved ? 'Verwijder uit opgeslagen' : 'Bewaar voor training'}">
    ${isSaved ? '🔖 Opgeslagen' : '🔖 Opslaan'}
  </button>`;

  const explainBtn = `<button class="btn-explain"
    onclick="event.stopPropagation();explainArticle('${escapeAttr(article.id)}',this)"
    title="Leg dit uit in eenvoudige taal">💡 Leg uit</button>`;

  // Trainer topic-badges (alleen zichtbaar in Trainer-view)
  const trainerTopics = article.trainerTopics || [];
  const trainerTagsHTML = (currentCategory === 'trainer' && trainerTopics.length > 0)
    ? `<div class="trainer-topics">${trainerTopics.map(t =>
        `<span class="trainer-topic-badge">${t.icon} ${escapeHtml(t.label)}</span>`
      ).join('')}</div>`
    : '';

  return `
    <div class="card ${isNew ? 'new-article' : ''} ${isWP ? 'whitepaper-card' : ''} ${isCP ? 'copilot-card' : ''} ${isPub ? 'publicatie-card' : ''} ${currentCategory === 'trainer' ? 'trainer-card' : ''}"
         onclick="openModal('${escapeAttr(article.id)}')"
         data-id="${escapeAttr(article.id)}">
      ${imageSection}
      <div class="card-body">
        <div class="card-meta">
          <div class="card-source">
            <span class="source-badge" style="${badgeStyle}">${escapeHtml(article.sourceLogo)}</span>
            <span style="font-size:0.75rem;color:var(--text2);font-weight:500">${escapeHtml(article.source)}</span>
            ${nlBadgeHTML}
            ${isWP ? '<span class="whitepaper-badge">📄 Whitepaper</span>' : ''}
            ${publicatieBadgeHTML}
            ${copilotBadgeHTML}
          </div>
          <div style="display:flex;align-items:center;gap:0.4rem">
            ${relevanceHTML}
            ${isNew ? '<span class="new-badge">Nieuw</span>' : ''}
            <span class="card-date">${dateStr}</span>
          </div>
        </div>
        <h2 class="card-title">${escapeHtml(article.title)}</h2>
        ${authorsHTML}
        <p class="card-description">${escapeHtml(article.description)}</p>
        ${trainerTagsHTML}
        ${noteHTML}
        <div class="card-footer">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <span class="card-category">${escapeHtml(article.category)}</span>
            ${saveBtn}
            ${explainBtn}
          </div>
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
  selectedTrainer = 'all';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Toon/verberg Copilot sub-filter
  const subfilter = document.getElementById('copilotSubfilter');
  if (subfilter) {
    subfilter.style.display = category === 'Copilot' ? 'block' : 'none';
    document.querySelectorAll('.copilot-sub-tab').forEach(t => t.classList.remove('active'));
    const first = document.querySelector('.copilot-sub-tab');
    if (first) first.classList.add('active');
  }

  // Toon/verberg trainer-filter bij Opgeslagen-tab
  const trainerFilter = document.getElementById('savedTrainerFilter');
  if (trainerFilter) {
    if (category === 'saved') {
      trainerFilter.style.display = 'block';
      // Standaard: eigen artikelen tonen als ingelogd
      selectedTrainer = currentUser ? currentUser.name : 'all';
      fetchAllUsersSaved();
    } else {
      trainerFilter.style.display = 'none';
    }
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

// ─── Datum filter ──────────────────────────────────────────
function setDateFilter(period, btn) {
  currentDateFilter = period;
  document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  applyFiltersAndRender();
}

// ─── Opgeslagen artikelen ──────────────────────────────────
function toggleSaved(articleId, btn) {
  if (savedArticleIds.has(articleId)) {
    // Verwijder uit opgeslagen
    savedArticleIds.delete(articleId);
    delete savedNotes[articleId];
    localStorage.setItem('avk_saved_notes', JSON.stringify(savedNotes));
    btn.classList.remove('saved');
    btn.innerHTML = '🔖 Opslaan';
    btn.title = 'Bewaar voor training';
    if (currentUser) {
      fetch(`/api/saved/${encodeURIComponent(articleId)}`, { method: 'DELETE' }).catch(() => {});
    }
    localStorage.setItem('avk_saved', JSON.stringify([...savedArticleIds]));
    updateSavedCount();
    if (currentCategory === 'saved') applyFiltersAndRender();
  } else {
    // Voeg toe aan opgeslagen
    savedArticleIds.add(articleId);
    btn.classList.add('saved');
    btn.innerHTML = '🔖 Opgeslagen';
    btn.title = 'Verwijder uit opgeslagen';
    localStorage.setItem('avk_saved', JSON.stringify([...savedArticleIds]));
    updateSavedCount();

    // Login prompt tonen (één keer per sessie, alleen als niet ingelogd)
    if (!currentUser && !sessionStorage.getItem('avk_login_prompt_shown')) {
      showLoginToast();
      sessionStorage.setItem('avk_login_prompt_shown', '1');
    }

    // Notitie modal tonen
    openNoteModal(articleId);
  }
}

// ─── Onboarding ────────────────────────────────────────────
function initOnboarding() {
  if (!localStorage.getItem('avk_onboarding_dismissed')) {
    const banner = document.getElementById('onboardingBanner');
    if (banner) banner.style.display = 'flex';
  }
}

function dismissOnboarding() {
  const banner = document.getElementById('onboardingBanner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('avk_onboarding_dismissed', '1');
}

// ─── Notitie modal ─────────────────────────────────────────
function openNoteModal(articleId) {
  pendingNoteArticleId = articleId;
  const textarea = document.getElementById('noteInput');
  textarea.value = savedNotes[articleId] || '';
  updateNoteCharCount();
  document.getElementById('noteModalOverlay').style.display = 'flex';
  setTimeout(() => textarea.focus(), 100);
}

function closeNoteModal(e, force) {
  if (!force && e && e.target !== document.getElementById('noteModalOverlay')) return;
  document.getElementById('noteModalOverlay').style.display = 'none';
  pendingNoteArticleId = null;
}

function updateNoteCharCount() {
  const textarea = document.getElementById('noteInput');
  const counter = document.getElementById('noteCharCount');
  if (textarea && counter) counter.textContent = textarea.value.length;
}

function saveWithNote(withNote) {
  if (!pendingNoteArticleId) { closeNoteModal(null, true); return; }
  const articleId = pendingNoteArticleId;
  const note = withNote ? document.getElementById('noteInput').value.trim() : '';

  if (note) {
    savedNotes[articleId] = note;
  } else {
    delete savedNotes[articleId];
  }
  localStorage.setItem('avk_saved_notes', JSON.stringify(savedNotes));

  // Sync naar server als ingelogd
  if (currentUser) {
    const art = allArticles.find(a => a.id === articleId);
    fetch('/api/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, title: art ? art.title : '', url: art ? art.url : '', note }),
    }).catch(() => {});
  }

  closeNoteModal(null, true);
  applyFiltersAndRender();
}

// ─── Login toast ───────────────────────────────────────────
function showLoginToast() {
  const toast = document.getElementById('loginToast');
  if (!toast) return;
  toast.style.display = 'flex';
  setTimeout(() => closeLoginToast(), 7000);
}

function closeLoginToast() {
  const toast = document.getElementById('loginToast');
  if (toast) toast.style.display = 'none';
}

function updateSavedCount() {
  const countEl = document.querySelector('.tab[data-cat="saved"] .tab-count');
  if (!countEl) return;
  // Tel alleen IDs die daadwerkelijk in de huidige artikelen bestaan
  const articleIdSet = new Set(allArticles.map(a => a.id));
  const visibleCount = [...savedArticleIds].filter(id => articleIdSet.has(id)).length;
  countEl.textContent = visibleCount > 0 ? visibleCount : '';
}

// ─── Tab badges (artikel-tellers) ─────────────────────────
function updateTabBadges() {
  const counts = {
    all: allArticles.length,
    nl: 0,
    trainer: allArticles.filter(a => (a.trainerScore || 0) >= 1).length,
    newsletter: newsletterSelectedIds.size,
  };
  allArticles.forEach(a => {
    counts[a.category] = (counts[a.category] || 0) + 1;
    if (a.isNlSource) counts['nl']++;
  });

  document.querySelectorAll('.tab[data-cat]').forEach(tab => {
    const cat = tab.dataset.cat;
    if (cat === 'saved') return; // handled by updateSavedCount
    const count = counts[cat] || 0;
    const countEl = tab.querySelector('.tab-count');
    if (countEl) countEl.textContent = count > 0 ? count : '';
  });
  updateSavedCount();
}

// ─── Trending topics ───────────────────────────────────────
function renderTrendingTopics(articles) {
  const section = document.getElementById('trendingSection');
  const container = document.getElementById('trendingChips');
  if (!section || !container) return;

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = articles.filter(a => new Date(a.publishedAt).getTime() >= cutoff);
  if (recent.length < 5) { section.style.display = 'none'; return; }

  const fullText = recent.map(a => a.title + ' ' + a.description).join(' ');
  const counts = {};
  TRENDING_TERMS.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    const n = (fullText.match(regex) || []).length;
    if (n > 0) counts[term] = n;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 9);
  if (sorted.length === 0) { section.style.display = 'none'; return; }

  const max = sorted[0][1];
  container.innerHTML = sorted.map(([term, count]) => {
    const cls = count >= max * 0.7 ? 'trending-hot' : count >= max * 0.4 ? 'trending-warm' : 'trending-cool';
    return `<button class="trending-chip ${cls}" onclick="searchTrending('${escapeAttr(term)}')">${escapeHtml(term)} <span class="trending-count">${count}×</span></button>`;
  }).join('');
  section.style.display = 'block';
}

function searchTrending(term) {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (!input) return;
  // Reset categorie naar Alle zodat zoekresultaten zichtbaar zijn
  if (currentCategory !== 'all') {
    const allTab = document.querySelector('.tab[data-cat="all"]');
    if (allTab) setCategory('all', allTab);
  }
  input.value = term;
  if (clearBtn) clearBtn.style.display = 'block';
  currentSearch = term;
  applyFiltersAndRender();
  input.focus();
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
// ─── Nieuwsbrief ───────────────────────────────────────────
const NL_SECTIONS = [
  { key: 'toepassingen', icon: '🛠️', label: 'Toepassingen',              color: '#1d4ed8' },
  { key: 'wetgeving',    icon: '⚖️', label: 'Wetgeving / Beleid / Ethiek', color: '#7c3aed' },
  { key: 'tech',         icon: '🔬', label: 'Tech & Wetenschap',           color: '#0f766e' },
];

function renderNewsletter() {
  // Verberg normale grid, toon nieuwsbrief-container
  const grid = document.getElementById('articlesGrid');
  const nlContainer = document.getElementById('newsletterContainer');
  const loadMore = document.getElementById('loadMoreWrapper');
  if (!nlContainer) return;

  grid.style.display = 'none';
  loadMore.style.display = 'none';
  nlContainer.style.display = 'block';

  // Groepeer op newsletter-categorie
  const groups = {
    toepassingen: filteredArticles.filter(a => a.newsletterCategory === 'toepassingen'),
    wetgeving:    filteredArticles.filter(a => a.newsletterCategory === 'wetgeving'),
    tech:         filteredArticles.filter(a => a.newsletterCategory === 'tech'),
  };

  const sectionsHTML = NL_SECTIONS.map(sec => {
    const arts = groups[sec.key] || [];
    const allSelected = arts.length > 0 && arts.every(a => newsletterSelectedIds.has(a.id));
    return `
      <div class="nl-section" data-section="${sec.key}">
        <div class="nl-section-header" style="border-left-color:${sec.color}">
          <span class="nl-section-icon">${sec.icon}</span>
          <span class="nl-section-title">${sec.label}</span>
          <span class="nl-section-count">${arts.length} artikel${arts.length !== 1 ? 'en' : ''}</span>
          <button class="nl-select-all-btn" onclick="selectAllInSection('${sec.key}')"
            title="${allSelected ? 'Deselecteer alle' : 'Selecteer alle'}">
            ${allSelected ? '☑ Deselecteer alle' : '☐ Selecteer alle'}
          </button>
        </div>
        <div class="nl-section-items">
          ${arts.length === 0
            ? `<p class="nl-empty">Geen artikelen in deze categorie voor de huidige filterperiode.</p>`
            : arts.slice(0, 25).map(a => createNlItemHTML(a)).join('')}
        </div>
      </div>`;
  }).join('');

  document.getElementById('nlSections').innerHTML = sectionsHTML;
  updateNewsletterBar();
}

function createNlItemHTML(article) {
  const isSel = newsletterSelectedIds.has(article.id);
  const dateStr = formatDate(article.publishedAt);
  const badgeStyle = `background:${article.sourceColor || '#6366f1'}`;
  const desc = article.description
    ? escapeHtml(article.description.substring(0, 110)) + '…'
    : '';
  return `
    <div class="nl-item${isSel ? ' nl-selected' : ''}"
         onclick="toggleNewsletterSelect('${escapeAttr(article.id)}', this)"
         data-id="${escapeAttr(article.id)}">
      <div class="nl-checkbox${isSel ? ' nl-checked' : ''}">${isSel ? '✓' : ''}</div>
      <span class="source-badge nl-badge-small" style="${badgeStyle}">${escapeHtml(article.sourceLogo)}</span>
      <div class="nl-item-content">
        <div class="nl-item-title">${escapeHtml(article.title)}</div>
        <div class="nl-item-desc">${desc}</div>
        <div class="nl-item-meta">${escapeHtml(article.source)} · ${dateStr}</div>
      </div>
      <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener"
         class="nl-item-link" onclick="event.stopPropagation()" title="Open artikel">↗</a>
    </div>`;
}

function toggleNewsletterSelect(articleId, el) {
  const item = el.closest('.nl-item') || el;
  const checkbox = item.querySelector('.nl-checkbox');
  if (newsletterSelectedIds.has(articleId)) {
    newsletterSelectedIds.delete(articleId);
    item.classList.remove('nl-selected');
    if (checkbox) { checkbox.classList.remove('nl-checked'); checkbox.textContent = ''; }
  } else {
    newsletterSelectedIds.add(articleId);
    item.classList.add('nl-selected');
    if (checkbox) { checkbox.classList.add('nl-checked'); checkbox.textContent = '✓'; }
  }
  localStorage.setItem('avk_newsletter', JSON.stringify([...newsletterSelectedIds]));
  updateNewsletterBar();
  updateTabBadges();
}

function selectAllInSection(sectionKey) {
  const arts = filteredArticles.filter(a => a.newsletterCategory === sectionKey);
  const allSelected = arts.every(a => newsletterSelectedIds.has(a.id));
  arts.forEach(a => {
    if (allSelected) newsletterSelectedIds.delete(a.id);
    else newsletterSelectedIds.add(a.id);
  });
  localStorage.setItem('avk_newsletter', JSON.stringify([...newsletterSelectedIds]));
  renderNewsletter(); // herrender voor geüpdatete checkboxes
  updateTabBadges();
}

function updateNewsletterBar() {
  const n = newsletterSelectedIds.size;
  const countEl = document.getElementById('nlSelectedCount');
  if (countEl) countEl.textContent = n > 0
    ? `${n} artikel${n === 1 ? '' : 'en'} geselecteerd`
    : 'Selecteer artikelen voor de nieuwsbrief';

  const copyBtn    = document.getElementById('nlCopyBtn');
  if (copyBtn) copyBtn.disabled = n === 0;
  const clearBtn   = document.getElementById('nlClearBtn');
  if (clearBtn) clearBtn.disabled = n === 0;
  const podcastBtn = document.getElementById('nlPodcastBtn');
  if (podcastBtn && !podcastPlaying) podcastBtn.disabled = n === 0;
}

function clearNewsletterSelection() {
  newsletterSelectedIds.clear();
  localStorage.removeItem('avk_newsletter');
  renderNewsletter();
  updateTabBadges();
}

async function copyNewsletter() {
  const selected = allArticles.filter(a => newsletterSelectedIds.has(a.id));
  if (selected.length === 0) return;

  const btn = document.getElementById('nlCopyBtn');
  const countEl = document.getElementById('nlSelectedCount');

  // Laadstatus tonen
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Schrijven…'; }
  if (countEl) countEl.textContent = `Nieuwsbriefitems schrijven (${selected.length} artikel${selected.length === 1 ? '' : 'en'})…`;

  try {
    const articleData = selected.map(a => ({
      id: a.id,
      title: a.title,
      description: (a.description || '').substring(0, 400),
      source: a.source,
      url: a.url,
      newsletterCategory: a.newsletterCategory || 'tech',
    }));

    const res = await fetch('/api/newsletter-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: articleData }),
    });

    if (!res.ok) throw new Error(`Server fout ${res.status}`);
    const data = await res.json();

    // Map id → gegenereerde content
    const contentMap = {};
    (data.items || []).forEach(item => { contentMap[item.id] = item.content; });

    // ─── Bouw de nieuwsbrief op ───────────────────────────
    const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const groups = {
      toepassingen: selected.filter(a => a.newsletterCategory === 'toepassingen'),
      wetgeving:    selected.filter(a => a.newsletterCategory === 'wetgeving'),
      tech:         selected.filter(a => a.newsletterCategory === 'tech'),
    };

    let text = `AVK AI Nieuwsbrief — ${today}\n`;
    text += '═'.repeat(52) + '\n\n';

    NL_SECTIONS.forEach(sec => {
      const arts = groups[sec.key];
      if (!arts || arts.length === 0) return;
      text += `${sec.icon}  ${sec.label.toUpperCase()}\n`;
      text += '─'.repeat(40) + '\n\n';
      arts.forEach(a => {
        text += `${a.title}\n`;
        text += `${a.source}  •  ${a.url}\n\n`;
        const raw = contentMap[a.id] || '';
        if (raw) {
          // Zet **markdown** om naar leesbare platte tekst met duidelijke koppen
          const clean = raw
            .replace(/\*\*Het nieuws\*\*/gi,            'HET NIEUWS')
            .replace(/\*\*Waarom dit belangrijk is\*\*/gi, 'WAAROM DIT BELANGRIJK IS')
            .replace(/\*\*Welke impact dit heeft\*\*/gi,   'WELKE IMPACT DIT HEEFT')
            .replace(/\*\*(.+?)\*\*/g, '$1');
          text += clean + '\n';
        }
        text += '\n· · ·\n\n';
      });
    });

    text += '═'.repeat(52) + '\n';
    text += 'AVK Training & Coaching  |  avk.nl\n';
    text += 'Slimmer werken met AI\n';

    // Kopieer naar klembord
    await navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✓ Nieuwsbrief gekopieerd!';
      btn.classList.add('nl-copied');
      setTimeout(() => { btn.innerHTML = '✍️ Schrijf &amp; kopieer'; btn.classList.remove('nl-copied'); }, 3000);
    }
    updateNewsletterBar(); // herstel teller

  } catch (err) {
    console.error('Nieuwsbrief genereren mislukt:', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⚠️ Probeer opnieuw';
      setTimeout(() => { btn.innerHTML = '✍️ Schrijf &amp; kopieer'; }, 2500);
    }
    updateNewsletterBar();
  }
}

// ─── Podcast player ────────────────────────────────────────
let podcastPlaying = false;
let podcastScript  = '';

async function generatePodcast() {
  const selected = allArticles.filter(a => newsletterSelectedIds.has(a.id));
  if (selected.length === 0) return;

  const btn      = document.getElementById('nlPodcastBtn');
  const countEl  = document.getElementById('nlSelectedCount');
  const player   = document.getElementById('podcastPlayer');

  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Script maken…'; }
  if (countEl) countEl.textContent = `Podcast script genereren (${selected.length} artikel${selected.length === 1 ? '' : 'en'})…`;

  // Stop eventueel lopende spraak
  stopPodcast(false);

  try {
    const articleData = selected.slice(0, 10).map(a => ({
      id: a.id,
      title: a.title,
      description: (a.description || '').substring(0, 300),
      source: a.source,
      newsletterCategory: a.newsletterCategory || 'tech',
    }));

    const res = await fetch('/api/podcast-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: articleData }),
    });
    if (!res.ok) throw new Error('Script ophalen mislukt');
    const data = await res.json();
    podcastScript = data.script;

    // Toon mini-player
    if (player) {
      document.getElementById('podcastLabel').textContent =
        `${selected.length} artikel${selected.length === 1 ? '' : 'en'} · ${data.usedAI ? 'AI-script' : 'template-script'}`;
      player.style.display = 'flex';
    }

    // Start afspelen
    playPodcastScript(podcastScript);

  } catch (err) {
    console.error('Podcast mislukt:', err);
    if (btn) { btn.disabled = false; btn.innerHTML = '🎙️ Beluister'; }
    updateNewsletterBar();
  }
}

function playPodcastScript(script) {
  if (!window.speechSynthesis) {
    alert('Jouw browser ondersteunt geen tekst-naar-spraak.\nProbeer Chrome of Edge.');
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(script);
  utterance.lang  = 'nl-NL';
  utterance.rate  = 0.95;
  utterance.pitch = 1.0;

  // Zoek een Nederlandse stem
  const trySpeak = (voices) => {
    const nlVoice = voices.find(v => v.lang === 'nl-NL') ||
                    voices.find(v => v.lang.startsWith('nl'));
    if (nlVoice) utterance.voice = nlVoice;

    utterance.onstart = () => {
      podcastPlaying = true;
      setPodcastUI(true);
    };
    utterance.onend = utterance.onerror = () => {
      podcastPlaying = false;
      setPodcastUI(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    trySpeak(voices);
  } else {
    window.speechSynthesis.onvoiceschanged = () => trySpeak(window.speechSynthesis.getVoices());
    setTimeout(() => { if (!podcastPlaying) trySpeak([]); }, 800);
  }
}

function stopPodcast(resetUI = true) {
  window.speechSynthesis && window.speechSynthesis.cancel();
  podcastPlaying = false;
  if (resetUI) setPodcastUI(false);
}

function setPodcastUI(playing) {
  const btn    = document.getElementById('nlPodcastBtn');
  const wave   = document.getElementById('podcastWave');
  const player = document.getElementById('podcastPlayer');

  if (btn) {
    btn.disabled  = false;
    btn.innerHTML = playing ? '⏹ Stop' : '🎙️ Beluister';
    btn.classList.toggle('podcast-playing', playing);
  }
  if (wave) wave.style.display = playing ? 'flex' : 'none';
  if (player && !playing) player.style.display = 'none';
  if (!playing) updateNewsletterBar();
}

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

// ─── Leg uit: artikel uitleggen in eenvoudige taal ─────────
async function explainArticle(articleId, btn) {
  const card = btn.closest('.card');
  const existingBox = card.querySelector('.explain-box');

  // Toggle: sluit als al open
  if (existingBox) {
    existingBox.remove();
    btn.textContent = '💡 Leg uit';
    btn.classList.remove('active');
    return;
  }

  const article = allArticles.find(a => a.id === articleId);
  if (!article) return;

  btn.disabled = true;
  btn.textContent = '⏳…';

  try {
    const resp = await fetch('/api/explain-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: article.id,
        title: article.title,
        description: article.description,
        category: article.category
      })
    });
    const data = await resp.json();

    const box = document.createElement('div');
    box.className = 'explain-box';
    box.innerHTML = `
      <div class="explain-header">
        <span>💡 In eenvoudige taal</span>
        <button class="explain-close" onclick="event.stopPropagation();(function(b){b.closest('.explain-box').remove();b.closest('.card').querySelector('.btn-explain').textContent='💡 Leg uit';b.closest('.card').querySelector('.btn-explain').classList.remove('active')})(this)">✕</button>
      </div>
      <p class="explain-text">${escapeHtml(data.explanation)}</p>
    `;
    card.querySelector('.card-body').appendChild(box);
    btn.textContent = '💡 Verberg';
    btn.classList.add('active');
  } catch {
    btn.textContent = '💡 Leg uit';
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// TRAINER-FILTER FUNCTIES
// ═══════════════════════════════════════════════════════════

async function fetchAllUsersSaved() {
  try {
    const res = await fetch('/api/saved/all');
    if (!res.ok) return;
    const data = await res.json();
    allUsersSavedMap = {};
    data.users.forEach(u => {
      allUsersSavedMap[u.name] = new Set(u.articleIds);
    });
    renderTrainerFilter();
    applyFiltersAndRender();
  } catch {
    // Geen MongoDB — gebruik localStorage
  }
}

function renderTrainerFilter() {
  const chips = document.getElementById('savedTrainerChips');
  if (!chips) return;

  const names = Object.keys(allUsersSavedMap).sort();
  if (names.length === 0) {
    chips.innerHTML = '<span class="trainer-chip-empty">Nog geen opgeslagen artikelen</span>';
    return;
  }

  chips.innerHTML = [
    `<button class="trainer-chip ${selectedTrainer === 'all' ? 'active' : ''}" onclick="setTrainerFilter('all')">👥 Iedereen</button>`,
    ...names.map(name => {
      const isMe = currentUser && currentUser.name === name;
      const label = isMe ? `👤 ${escapeHtml(name)} (jij)` : escapeHtml(name);
      return `<button class="trainer-chip ${selectedTrainer === name ? 'active' : ''}" onclick="setTrainerFilter('${escapeAttr(name)}')">${label}</button>`;
    })
  ].join('');
}

function setTrainerFilter(name) {
  selectedTrainer = name;
  renderTrainerFilter();
  applyFiltersAndRender();
}

// ═══════════════════════════════════════════════════════════
// AUTH FUNCTIES
// ═══════════════════════════════════════════════════════════

async function initAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
      await loadSavedFromServer();
    }
  } catch {
    // Netwerkfout — gebruik localStorage
  }
  renderAuthWidget();
}

async function loadSavedFromServer() {
  try {
    const serverRes = await fetch('/api/saved');
    if (!serverRes.ok) return;
    const serverData = await serverRes.json();
    const serverIdSet = new Set(serverData.ids);

    // Server is de enige bron van waarheid na inloggen
    savedArticleIds = serverIdSet;
    localStorage.setItem('avk_saved', JSON.stringify([...savedArticleIds]));
  } catch {
    // Behoud localStorage bij fout
  }
}

function renderAuthWidget() {
  const widget = document.getElementById('authWidget');
  if (!widget) return;
  if (currentUser) {
    widget.innerHTML = `
      <div class="user-badge">
        <span class="user-name">👤 ${escapeHtml(currentUser.name)}</span>
        <button class="btn-logout" onclick="logout()" title="Uitloggen">🚪</button>
      </div>`;
  } else {
    widget.innerHTML = `<button class="btn-login" onclick="openLoginModal()">🔑 Inloggen</button>`;
  }
}

function openLoginModal(panel = 'login') {
  document.getElementById('loginModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  showAuthPanel(panel);
}

function closeLoginModal(event, force = false) {
  if (force || (event && event.target === document.getElementById('loginModalOverlay'))) {
    document.getElementById('loginModalOverlay').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('registerDirectError').style.display = 'none';
    document.getElementById('loginForm').reset();
    document.getElementById('registerDirectForm').reset();
  }
}

function showAuthPanel(panel) {
  document.getElementById('authPanelLogin').style.display    = panel === 'login'    ? '' : 'none';
  document.getElementById('authPanelRegister').style.display = panel === 'register' ? '' : 'none';
  setTimeout(() => {
    const el = panel === 'login'
      ? document.getElementById('loginUsername')
      : document.getElementById('regUsername');
    if (el) el.focus();
  }, 80);
}

async function submitLogin(event) {
  event.preventDefault();
  const username  = document.getElementById('loginUsername').value.trim();
  const password  = document.getElementById('loginPassword').value;
  const errorEl   = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmit');

  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Bezig…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Inloggen mislukt';
      errorEl.style.display = 'block';
      return;
    }

    currentUser = data;
    closeLoginModal(null, true);
    renderAuthWidget();
    await loadSavedFromServer();
    updateSavedCount();
    if (currentCategory === 'saved') applyFiltersAndRender();

  } catch {
    errorEl.textContent = 'Netwerkfout. Probeer opnieuw.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Inloggen';
  }
}

async function submitDirectRegister(event) {
  event.preventDefault();
  const username  = document.getElementById('regUsername').value.trim();
  const password  = document.getElementById('regPassword').value;
  const confirm   = document.getElementById('regPasswordConfirm').value;
  const errorEl   = document.getElementById('registerDirectError');
  const submitBtn = document.getElementById('registerDirectSubmit');

  errorEl.style.display = 'none';

  if (password !== confirm) {
    errorEl.textContent = 'Wachtwoorden komen niet overeen';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Bezig…';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Registratie mislukt';
      errorEl.style.display = 'block';
      return;
    }

    currentUser = data;
    closeLoginModal(null, true);
    renderAuthWidget();
    await loadSavedFromServer();
    updateSavedCount();

  } catch {
    errorEl.textContent = 'Netwerkfout. Probeer opnieuw.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Account aanmaken';
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  currentUser = null;
  renderAuthWidget();
}

async function handleInviteFlow(token) {
  // Verberg de app, toon register-sectie
  const toHide = ['.filters-bar', '.summary-section', '.stats-bar', 'main', '.site-footer', '#trendingSection', '#copilotSubfilter'];
  toHide.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  });
  document.getElementById('registerSection').style.display = 'block';

  try {
    const res = await fetch(`/api/invite/${token}`);
    if (!res.ok) {
      document.getElementById('registerSection').innerHTML = `
        <div class="register-container">
          <div class="register-card">
            <div class="register-header">
              <h2 style="color:#b31b1b">Ongeldige uitnodiging</h2>
              <p>Deze uitnodigingslink is ongeldig of verlopen.<br>Neem contact op met de beheerder.</p>
            </div>
          </div>
        </div>`;
      return;
    }
    const data = await res.json();
    document.getElementById('registerName').value  = data.name;
    document.getElementById('registerEmail').value = data.email;
    setTimeout(() => document.getElementById('registerPassword').focus(), 100);
  } catch {
    document.getElementById('registerSection').innerHTML = `
      <div class="register-container">
        <div class="register-card">
          <div class="register-header">
            <h2>Verbindingsfout</h2>
            <p>Kan de server niet bereiken. Ververs de pagina en probeer opnieuw.</p>
          </div>
        </div>
      </div>`;
  }
}

async function submitRegister(event) {
  event.preventDefault();
  const password  = document.getElementById('registerPassword').value;
  const confirm   = document.getElementById('registerConfirm').value;
  const errorEl   = document.getElementById('registerError');
  const submitBtn = document.getElementById('registerSubmit');

  errorEl.style.display = 'none';

  if (password !== confirm) {
    errorEl.textContent = 'Wachtwoorden komen niet overeen';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Bezig…';

  try {
    const res = await fetch(`/api/invite/${inviteToken}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Registratie mislukt';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Account aanmaken';
      return;
    }

    // Succes: stuur door naar app (zonder invite-param)
    window.location.href = '/';

  } catch {
    errorEl.textContent = 'Netwerkfout. Probeer opnieuw.';
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Account aanmaken';
  }
}
