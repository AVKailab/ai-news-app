const express = require('express');
const Parser = require('rss-parser');
const path = require('path');
const https = require('https');
const http = require('http');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; AI-News-App/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
    ]
  }
});

const PORT = process.env.PORT || 3456;

// Betrouwbare AI-nieuws RSS feeds
const FEEDS = [
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    category: 'Tech Nieuws',
    color: '#00A859',
    logo: 'TC'
  },
  {
    name: 'VentureBeat AI',
    url: 'https://venturebeat.com/ai/feed/',
    category: 'AI Nieuws',
    color: '#E8342A',
    logo: 'VB'
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    category: 'Research',
    color: '#A31F34',
    logo: 'MIT'
  },
  {
    name: 'The Verge AI',
    url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml',
    category: 'Tech Nieuws',
    color: '#FA4B32',
    logo: 'TV'
  },
  {
    name: 'Wired AI',
    url: 'https://www.wired.com/feed/tag/ai/latest/rss',
    category: 'Tech Nieuws',
    color: '#000000',
    logo: 'WR'
  },
  {
    name: 'AI News',
    url: 'https://www.artificialintelligence-news.com/feed/',
    category: 'AI Nieuws',
    color: '#6C5CE7',
    logo: 'AIN'
  },
  {
    name: 'Ars Technica AI',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    category: 'Tech Nieuws',
    color: '#FF4E00',
    logo: 'ARS'
  },
  {
    name: 'Hugging Face',
    url: 'https://huggingface.co/blog/feed.xml',
    category: 'Research',
    color: '#FF9D00',
    logo: 'HF'
  },
  {
    name: 'Google DeepMind',
    url: 'https://deepmind.google/blog/rss.xml',
    category: 'Research',
    color: '#4285F4',
    logo: 'DM'
  },
  {
    name: 'The Gradient',
    url: 'https://thegradient.pub/rss/',
    category: 'Research',
    color: '#764ABC',
    logo: 'TG'
  },
  // ─── Hoogwaardige Publicaties (think-tanks & thought leaders) ────────────
  {
    name: 'MIT Sloan Management Review',
    url: 'https://sloanreview.mit.edu/feed/',
    category: 'Publicaties',
    color: '#A31F34',
    logo: 'MITSL',
    isPublicationSource: true
  },
  {
    name: 'One Useful Thing',
    url: 'https://www.oneusefulthing.org/feed',
    category: 'Publicaties',
    color: '#2E6B3E',
    logo: 'OUT',
    isPublicationSource: true
  },
  {
    name: 'The Interconnects',
    url: 'https://www.interconnects.ai/feed',
    category: 'Publicaties',
    color: '#6B21A8',
    logo: 'TIC',
    isPublicationSource: true
  },
  {
    name: 'Import AI',
    url: 'https://jack-clark.net/feed/',
    category: 'Publicaties',
    color: '#1D4ED8',
    logo: 'IAI',
    isPublicationSource: true
  },
  {
    name: 'AI as Normal Technology',
    url: 'https://www.normaltech.ai/feed',
    category: 'Publicaties',
    color: '#B45309',
    logo: 'ANT',
    isPublicationSource: true
  },
  // ─── Microsoft Copilot feeds ──────────────────────────────
  {
    name: 'Microsoft 365 Blog',
    url: 'https://www.microsoft.com/en-us/microsoft-365/blog/feed/',
    category: 'Tech Nieuws',
    color: '#0078d4',
    logo: 'M365',
    isMicrosoftSource: true
  },
  {
    name: 'Microsoft AI Blog',
    url: 'https://blogs.microsoft.com/ai/feed/',
    category: 'Tech Nieuws',
    color: '#0078d4',
    logo: 'MSAI',
    isMicrosoftSource: true
  },
  {
    name: 'Windows Blog',
    url: 'https://blogs.windows.com/feed/',
    category: 'Tech Nieuws',
    color: '#0078d4',
    logo: 'WIN',
    isMicrosoftSource: true
  },
  // ─── Nederlandse bronnen ──────────────────────────────────
  {
    name: 'Tweakers',
    url: 'https://tweakers.net/feeds/nieuws.xml',
    category: 'Tech Nieuws',
    color: '#e66800',
    logo: 'TWK',
    isNlSource: true
  },
  {
    name: 'Emerce',
    url: 'https://www.emerce.nl/feed',
    category: 'AI Nieuws',
    color: '#0077b6',
    logo: 'EMR',
    isNlSource: true
  },
  {
    name: 'Frankwatching',
    url: 'https://www.frankwatching.com/feed/',
    category: 'AI Nieuws',
    color: '#e63946',
    logo: 'FW',
    isNlSource: true
  },
  // ─── Whitepaper feeds (arXiv) ────────────────────────────
  {
    name: 'arXiv — AI',
    url: 'https://rss.arxiv.org/rss/cs.AI',
    category: 'Whitepapers',
    color: '#B31B1B',
    logo: 'arXiv',
    isWhitepaperSource: true
  },
  {
    name: 'arXiv — Machine Learning',
    url: 'https://rss.arxiv.org/rss/cs.LG',
    category: 'Whitepapers',
    color: '#B31B1B',
    logo: 'arXiv',
    isWhitepaperSource: true
  },
  {
    name: 'arXiv — NLP',
    url: 'https://rss.arxiv.org/rss/cs.CL',
    category: 'Whitepapers',
    color: '#B31B1B',
    logo: 'arXiv',
    isWhitepaperSource: true
  }
];

// ─── NL-bronnen: AI-filterwoorden (sla niet-AI artikelen over) ────────────
const NL_AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'chatgpt', 'gpt',
  'gemini', 'claude', 'copilot', 'openai', 'anthropic', 'llm',
  'automatisering', 'kunstmatige intelligentie', 'taalmodel', 'algoritme',
  'chatbot', 'deepmind', 'nvidia', 'deepseek', 'mistral', 'generatieve',
  'neural', 'robotica', 'deep learning', 'perplexity', 'agenten',
  'sora', 'dall-e', 'midjourney', 'intelligentie', 'taalmodellen',
];

// ─── Relevantiescore ──────────────────────────────────────────────────────
const RELEVANCE_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'deep learning',
  'llm', 'gpt', 'chatgpt', 'gemini', 'claude', 'copilot', 'openai',
  'anthropic', 'neural', 'generative', 'agent', 'model', 'transformer',
  'benchmark', 'inference', 'training data',
];

function calculateRelevanceScore(item) {
  const text = ((item.title || '') + ' ' + (item.contentSnippet || item.summary || '')).toLowerCase();
  return Math.min(RELEVANCE_KEYWORDS.filter(k => text.includes(k)).length, 5);
}

// ─── Publicatie detectie ─────────────────────────────────────────────────
// Sleutelwoorden die een artikel identificeren als een hoogwaardige publicatie
// (voor artikelen uit externe feeds)
const PUBLICATION_KEYWORDS = [
  'report:', 'new report', 'whitepaper', 'policy paper', 'research report',
  'annual report', 'outlook report', 'survey report', 'global report',
  'wef report', 'world economic forum', 'oecd report', 'mckinsey report',
  'gartner report', 'forrester report', 'deloitte insights',
  'think tank', 'policy brief', 'executive summary', 'in-depth analysis',
  'stanford hai', 'brookings', 'rand corporation',
];

function detectPublicatie(item, feed) {
  if (feed.isPublicationSource) return true;
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  return PUBLICATION_KEYWORDS.some(k => text.includes(k));
}

// ─── Microsoft Copilot detectie ────────────────────────────────────────────
// Zakelijk = Microsoft 365 Copilot, Teams, enterprise-toepassingen
const COPILOT_ZAKELIJK_KEYWORDS = [
  'microsoft 365 copilot', 'm365 copilot', 'copilot for microsoft 365',
  'copilot for work', 'copilot in teams', 'copilot in outlook', 'copilot in word',
  'copilot in excel', 'copilot in powerpoint', 'copilot in sharepoint',
  'copilot studio', 'power platform', 'power automate', 'power bi',
  'dynamics 365', 'dynamics copilot', 'github copilot', 'azure ai',
  'enterprise', 'business copilot', 'workplace', 'commercial',
  'viva insights', 'microsoft teams', 'sharepoint', 'loop copilot',
  'copilot for sales', 'copilot for service', 'copilot for finance',
];

// Consument = Windows, Bing, Edge, mobiele apps, persoonlijk gebruik
const COPILOT_CONSUMENT_KEYWORDS = [
  'copilot+ pc', 'copilot in windows', 'windows copilot', 'copilot key',
  'bing copilot', 'copilot in bing', 'copilot in edge', 'copilot app',
  'copilot daily', 'copilot vision', 'copilot voice', 'copilot for consumers',
  'consumer', 'personal', 'windows 11', 'android', 'ios', 'iphone', 'mobile',
  'copilot notebook', 'copilot on your phone',
];

// Sleutelwoorden die bevestigen dat het specifiek om Microsoft Copilot gaat
// (voor artikelen uit externe, niet-Microsoft feeds)
const MICROSOFT_COPILOT_SPECIFIC = [
  'microsoft copilot', 'copilot for microsoft 365', 'm365 copilot',
  'copilot+ pc', 'copilot in windows', 'copilot studio', 'github copilot',
  'copilot in teams', 'copilot in outlook', 'copilot in bing',
];

function detectCopilot(item, feed) {
  const text = (
    (item.title || '') + ' ' +
    (item.description || '') + ' ' +
    (item.contentSnippet || '')
  ).toLowerCase();

  // Geen 'copilot' → sla over
  if (!text.includes('copilot')) return null;

  // Externe feeds: vereist dat het aantoonbaar over Microsoft Copilot gaat
  if (!feed.isMicrosoftSource) {
    const isMsCopilot = MICROSOFT_COPILOT_SPECIFIC.some(k => text.includes(k));
    if (!isMsCopilot) return null;
  }

  // Bepaal type op basis van keyword-score
  const zakelijkScore = COPILOT_ZAKELIJK_KEYWORDS.filter(k => text.includes(k)).length;
  const consumentScore = COPILOT_CONSUMENT_KEYWORDS.filter(k => text.includes(k)).length;

  if (zakelijkScore > consumentScore) return 'zakelijk';
  if (consumentScore > zakelijkScore) return 'consument';
  // Bij Microsoft-feeds: M365 Blog → zakelijk, Windows Blog → consument
  if (feed.name === 'Microsoft 365 Blog') return 'zakelijk';
  if (feed.name === 'Windows Blog') return 'consument';
  return 'algemeen';
}

// Trefwoorden die een artikel als whitepaper classificeren (ook vanuit nieuwsfeeds)
const WHITEPAPER_KEYWORDS = [
  'whitepaper', 'white paper', 'technical report', 'research paper',
  'paper:', 'we introduce', 'we present', 'we propose',
  'arxiv', 'preprint', 'published paper', 'new model',
];

// Grote AI-labs waarvan paperpublicaties als whitepaper gelden
const AI_LAB_PUBLISHERS = [
  'openai', 'anthropic', 'deepmind', 'google brain', 'google research',
  'meta ai', 'microsoft research', 'nvidia research', 'mistral', 'cohere',
  'hugging face', 'stanford', 'mit csail', 'berkeley', 'carnegie mellon',
];

function detectWhitepaper(item, feed) {
  if (feed.isWhitepaperSource) return true;
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  if (WHITEPAPER_KEYWORDS.some(k => text.includes(k))) return true;
  if (AI_LAB_PUBLISHERS.some(lab => text.includes(lab)) &&
      (text.includes('paper') || text.includes('model') || text.includes('benchmark'))) return true;
  return false;
}

// Cache voor articles
let articlesCache = [];
let lastFetch = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minuten

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const articles = parsed.items.slice(0, feed.isNlSource ? 30 : 15).map(item => {
      let image = null;
      if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
        image = item.mediaContent.$.url;
      } else if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
        image = item.mediaThumbnail.$.url;
      } else if (item.enclosure && item.enclosure.url) {
        image = item.enclosure.url;
      }

      // Haal afbeelding uit content als fallback
      if (!image && item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) image = imgMatch[1];
      }
      if (!image && item['content:encoded']) {
        const imgMatch = item['content:encoded'].match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) image = imgMatch[1];
      }

      const description = item.contentSnippet || item.summary || item.content || '';
      const cleanDescription = description.replace(/<[^>]+>/g, '').substring(0, 280);

      const isWhitepaper = detectWhitepaper(item, feed);
      const copilotType = detectCopilot(item, feed);
      const isPublicatie = detectPublicatie(item, feed);

      // Bepaal definitieve categorie (prioriteit: whitepaper > publicatie > copilot > feed-default)
      let finalCategory = feed.category;
      if (feed.isWhitepaperSource || isWhitepaper) {
        finalCategory = 'Whitepapers';
      } else if (isPublicatie && !copilotType) {
        finalCategory = 'Publicaties';
      } else if (copilotType) {
        finalCategory = 'Copilot';
      }

      // Nederlandse bronnen: sla niet-AI artikelen over
      if (feed.isNlSource) {
        const titleDesc = ((item.title || '') + ' ' + cleanDescription).toLowerCase();
        if (!NL_AI_KEYWORDS.some(k => titleDesc.includes(k))) return null;
      }

      // arXiv PDF-link afleiden van abstract-URL
      let pdfUrl = null;
      const articleUrl = item.link || '';
      if (feed.isWhitepaperSource && articleUrl.includes('arxiv.org/abs/')) {
        pdfUrl = articleUrl.replace('/abs/', '/pdf/');
      } else if (articleUrl.includes('arxiv.org')) {
        pdfUrl = articleUrl.replace('/abs/', '/pdf/');
      }

      // Auteurs uit arXiv-feed
      const authors = item.author || item['dc:creator'] || item.creator || null;

      // Voor arXiv: gebruik de volledige beschrijving als abstract
      const rawAbstract = feed.isWhitepaperSource
        ? (item.contentSnippet || item.summary || item.content || '').replace(/<[^>]+>/g, '').substring(0, 600)
        : cleanDescription;

      return {
        id: crypto.createHash('sha1').update(item.link || item.guid || Math.random().toString()).digest('hex').substring(0, 20),
        title: item.title || 'Geen titel',
        description: feed.isWhitepaperSource ? rawAbstract : cleanDescription,
        url: articleUrl || '#',
        image: image,
        source: feed.name,
        sourceColor: feed.color,
        sourceLogo: feed.logo,
        category: finalCategory,
        isWhitepaper,
        isPublicatie: isPublicatie && !isWhitepaper && !copilotType,
        copilotType: copilotType || null,
        pdfUrl,
        authors,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        isoDate: item.isoDate || item.pubDate,
        isNlSource: feed.isNlSource || false,
        relevanceScore: calculateRelevanceScore(item)
      };
    });
    return articles.filter(Boolean);
  } catch (error) {
    console.error(`Fout bij laden van ${feed.name}:`, error.message);
    return [];
  }
}

async function fetchAllArticles() {
  console.log('Artikelen ophalen van alle feeds...');
  const results = await Promise.allSettled(FEEDS.map(feed => fetchFeed(feed)));

  const allArticles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // Sorteer op datum (nieuwste eerst)
  allArticles.sort((a, b) => {
    const dateA = new Date(a.publishedAt);
    const dateB = new Date(b.publishedAt);
    return dateB - dateA;
  });

  articlesCache = allArticles;
  lastFetch = Date.now();
  console.log(`${allArticles.length} artikelen opgehaald`);
  return allArticles;
}

// ─── Nederlandstalige samenvatting generator ───────────────────────────────
const TOPICS = [
  { label: 'grote taalmodellen (LLM\'s)',   keys: ['llm', 'large language model', 'language model', 'foundation model', 'transformer'] },
  { label: 'AI-agenten',                    keys: ['agent', 'agentic', 'autonomous ai', 'ai assistant'] },
  { label: 'generatieve AI',                keys: ['generative ai', 'gen ai', 'genai', 'text-to-image', 'image generation', 'video generation', 'diffusion'] },
  { label: 'kunstmatige algemene intelligentie (AGI)', keys: ['agi', 'artificial general intelligence', 'superintelligence'] },
  { label: 'AI-veiligheid',                 keys: ['ai safety', 'alignment', 'responsible ai', 'ethics', 'bias', 'hallucination', 'regulation', 'governance'] },
  { label: 'robotica',                      keys: ['robot', 'robotics', 'humanoid', 'embodied ai'] },
  { label: 'AI in de gezondheidszorg',      keys: ['health', 'medical', 'clinical', 'drug discovery', 'diagnosis'] },
  { label: 'open-source AI',               keys: ['open source', 'open-source', 'open weight', 'llama', 'mistral', 'open model'] },
  { label: 'AI-chips en hardware',          keys: ['chip', 'gpu', 'tpu', 'nvidia', 'hardware', 'semiconductor', 'datacenter'] },
  { label: 'AI-tools en producten',         keys: ['copilot', 'chatgpt', 'gemini', 'claude', 'grok', 'sora', 'dall-e', 'midjourney', 'plugin', 'api'] },
];

const COMPANIES = [
  'OpenAI', 'Google', 'Microsoft', 'Meta', 'Anthropic', 'Apple', 'Amazon', 'NVIDIA',
  'DeepMind', 'xAI', 'Mistral', 'Cohere', 'Stability AI', 'Hugging Face', 'Inflection',
  'Character.AI', 'Perplexity', 'Runway', 'Scale AI', 'IBM', 'Samsung', 'Baidu', 'Alibaba',
];

function generateDutchSummary(articles) {
  const now = new Date();
  const cutoff = new Date(now - 24 * 60 * 60 * 1000);
  const recent = articles.filter(a => new Date(a.publishedAt) >= cutoff);

  if (recent.length === 0) {
    return { summary: 'Er zijn de afgelopen 24 uur geen nieuwe AI-artikelen gevonden.', count: 0 };
  }

  const fullText = recent.map(a => (a.title + ' ' + a.description).toLowerCase()).join(' ');
  const titlesText = recent.map(a => a.title).join(' ');

  // Detecteer aanwezige onderwerpen
  const foundTopics = TOPICS.filter(t =>
    t.keys.some(k => fullText.includes(k))
  ).map(t => t.label);

  // Detecteer genoemde bedrijven (in titels)
  const foundCompanies = COMPANIES.filter(c =>
    titlesText.toLowerCase().includes(c.toLowerCase())
  );

  // Tel per bron
  const sourceCounts = {};
  recent.forEach(a => { sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1; });
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  // Verzamel opvallende titels (top 3 meest recente)
  const topTitles = recent.slice(0, 3).map(a => `"${a.title}"`);

  // Bouw Nederlandse samenvatting op
  const parts = [];

  const dateStr = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  parts.push(`In de afgelopen 24 uur zijn er ${recent.length} nieuwe AI-artikelen verschenen.`);

  if (foundTopics.length > 0) {
    const topicList = foundTopics.slice(0, 4);
    if (topicList.length === 1) {
      parts.push(`De aandacht gaat vandaag vooral uit naar ${topicList[0]}.`);
    } else {
      const last = topicList.pop();
      parts.push(`De berichtgeving richt zich voornamelijk op ${topicList.join(', ')} en ${last}.`);
    }
  }

  if (foundCompanies.length > 0) {
    const compList = [...new Set(foundCompanies)].slice(0, 4);
    if (compList.length === 1) {
      parts.push(`${compList[0]} staat centraal in het nieuws van vandaag.`);
    } else {
      const last = compList.pop();
      parts.push(`Prominente spelers in het nieuws zijn ${compList.join(', ')} en ${last}.`);
    }
  }

  if (topTitles.length > 0) {
    parts.push(`Opvallende berichten zijn onder meer: ${topTitles.join('; ')}.`);
  }

  if (topSources.length > 0) {
    parts.push(`De meeste updates kwamen vandaag van ${topSources.join(', ')}.`);
  }

  return { summary: parts.join(' '), count: recent.length, generatedAt: now.toISOString() };
}

// Statische bestanden serveren
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint voor artikelen
app.get('/api/articles', async (req, res) => {
  try {
    const now = Date.now();
    const needsRefresh = !lastFetch || (now - lastFetch) > CACHE_DURATION;

    if (needsRefresh) {
      await fetchAllArticles();
    }

    const { search, source, category, limit = 50 } = req.query;
    let filtered = [...articlesCache];

    if (search) {
      const query = search.toLowerCase();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
      );
    }

    if (source && source !== 'all') {
      filtered = filtered.filter(a => a.source === source);
    }

    if (category && category !== 'all') {
      filtered = filtered.filter(a => a.category === category);
    }

    res.json({
      articles: filtered.slice(0, parseInt(limit)),
      total: filtered.length,
      lastUpdated: lastFetch,
      sources: FEEDS.map(f => ({ name: f.name, category: f.category, color: f.color }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Fout bij ophalen van artikelen' });
  }
});

// Samenvatting endpoint
app.get('/api/summary', async (req, res) => {
  try {
    const now = Date.now();
    const needsRefresh = !lastFetch || (now - lastFetch) > CACHE_DURATION;
    if (needsRefresh) await fetchAllArticles();
    const result = generateDutchSummary(articlesCache);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Fout bij genereren samenvatting' });
  }
});

// ─── PDF ophalen en samenvatten ───────────────────────────
function fetchBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) return reject(new Error('Te veel redirects'));
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-News-App/1.0)',
        'Accept': 'application/pdf,*/*'
      },
      timeout: 20000
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchBuffer(res.headers.location, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function summarizePaperDutch(text, title) {
  // Haal abstract op (eerste grote alinea na "Abstract")
  const abstractMatch = text.match(/Abstract[.\s\n]+([\s\S]{100,1200}?)(?:\n{2,}|\d\s+Introduction)/i);
  const abstract = abstractMatch ? abstractMatch[1].trim() : '';

  // Haal introductie op
  const introMatch = text.match(/\d\s+Introduction[\s\n]+([\s\S]{100,800}?)(?:\n{2,}|\d\s+)/i);
  const intro = introMatch ? introMatch[1].trim() : '';

  const content = abstract || intro || text.substring(0, 800);

  // Detecteer methoden en bijdragen
  const methods = [];
  if (/transformer|attention|self-attention/i.test(text)) methods.push('Transformer-architectuur');
  if (/reinforcement learning|rlhf|rl from/i.test(text)) methods.push('Reinforcement Learning');
  if (/fine-tun|finetuning|fine tuning/i.test(text)) methods.push('Fine-tuning');
  if (/retrieval|rag|retrieval-augmented/i.test(text)) methods.push('Retrieval-Augmented Generation');
  if (/benchmark|evaluation|eval/i.test(text)) methods.push('benchmarkevaluaties');
  if (/multimodal|vision|image/i.test(text)) methods.push('multimodale capaciteiten');
  if (/agent|tool use|function call/i.test(text)) methods.push('AI-agenten');
  if (/safety|alignment|harmful/i.test(text)) methods.push('AI-veiligheid en alignment');

  const parts = [];
  parts.push(`**${title}**`);

  if (content) {
    const cleaned = content.replace(/\s+/g, ' ').substring(0, 500);
    parts.push(`\n\n**Abstract (vertaald):** ${cleaned}`);
  }

  if (methods.length > 0) {
    parts.push(`\n\n**Kernonderwerpen:** ${methods.join(', ')}.`);
  }

  return parts.join('');
}

app.get('/api/paper-summary', async (req, res) => {
  const { url, title } = req.query;
  if (!url) return res.status(400).json({ error: 'Geen URL opgegeven' });

  // Alleen vertrouwde domeinen
  const allowedDomains = ['arxiv.org', 'openai.com', 'anthropic.com', 'deepmind.google',
    'research.google', 'ai.meta.com', 'microsoft.com', 'huggingface.co'];
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: 'Ongeldige URL' }); }
  if (!allowedDomains.some(d => parsedUrl.hostname.endsWith(d))) {
    return res.status(403).json({ error: 'Domein niet toegestaan' });
  }

  try {
    const buffer = await fetchBuffer(url);
    const data = await pdfParse(buffer, { max: 3 }); // eerste 3 pagina's
    const summary = summarizePaperDutch(data.text, title || 'Whitepaper');
    res.json({ summary, pages: data.numpages, chars: data.text.length });
  } catch (err) {
    res.status(500).json({ error: `PDF kon niet worden geladen: ${err.message}` });
  }
});

// Forceer refresh
app.get('/api/refresh', async (req, res) => {
  lastFetch = null;
  const articles = await fetchAllArticles();
  res.json({ success: true, count: articles.length });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🤖 AI Nieuws App draait op http://localhost:${PORT}`);
  console.log(`📰 Feeds laden bij eerste verzoek...\n`);
});

// Warm up de cache direct bij opstarten
fetchAllArticles().catch(console.error);
