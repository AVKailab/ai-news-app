const express = require('express');
const Parser = require('rss-parser');
const path = require('path');
const https = require('https');
const http = require('http');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// ─── Supabase setup ───────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET   = process.env.JWT_SECRET || 'change-me-in-production';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase verbonden');
} else {
  console.warn('Supabase niet geconfigureerd (SUPABASE_URL / SUPABASE_SERVICE_KEY ontbreekt)');
}

const app = express();
app.use(cookieParser());
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

const PORT = process.env.PORT || 10000;

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
    url: 'https://venturebeat.com/category/ai/feed',
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
    url: 'https://www.theverge.com/rss/index.xml',
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
    name: 'TLDR AI',
    url: 'https://tldr.tech/api/rss/ai',
    category: 'AI Nieuws',
    color: '#0EA5E9',
    logo: 'TLDR'
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

// ─── Trainer-relevantie (gebaseerd op AVK trainingsportfolio) ──────────────
// Tier 1: exacte tools die AVK traint (score ×2 per match)
const TRAINER_TOOL_KEYWORDS = [
  'copilot studio', 'copilot agent', 'm365 copilot', 'copilot for microsoft',
  'copilot in outlook', 'copilot in teams', 'copilot in excel', 'copilot in word',
  'microsoft copilot', 'copilot',
  'chatgpt', 'gpt-4', 'gpt-5', 'gpt4o', 'openai',
  'google gemini', 'gemini',
  'le chat', 'mistral',
  'perplexity',
  'duck.ai', 'duckduckgo ai',
  'github copilot', 'cursor ai',
];

// Tier 2: onderwerpen die AVK traint (score ×1 per match)
const TRAINER_TOPIC_KEYWORDS = [
  'ai act', 'eu ai act', 'ai regulation', 'ai wet', 'ai regelgeving', 'ai liability',
  'prompt engineering', 'prompting', 'system prompt',
  'vibe coding',
  'ai security', 'ai privacy', 'data security', 'ai veiligheid',
  'ai policy', 'ai governance', 'ai beleid',
  'ai productivity', 'ai productiviteit', 'ai workflow',
  'ai literacy', 'ai geletterdheid',
  'notuleren', 'meeting transcri', 'notulen',
  'jobcrafting', 'job crafting',
  'ai leadership', 'ai leiderschap',
];

// Topic-map: keyword → badge label + icon (voor trainer-kaartjes, max 3 per artikel)
const TRAINER_TOPIC_MAP = [
  { keys: ['copilot studio', 'copilot agent'],                                  label: 'Copilot Studio',    icon: '🏗️' },
  { keys: ['copilot', 'microsoft copilot', 'm365 copilot'],                     label: 'Copilot',           icon: '🪟' },
  { keys: ['chatgpt', 'gpt-5', 'gpt-4', 'gpt4o', 'openai'],                    label: 'ChatGPT',           icon: '💬' },
  { keys: ['gemini', 'google gemini'],                                           label: 'Gemini',            icon: '♊' },
  { keys: ['mistral', 'le chat'],                                                label: 'Mistral',           icon: '🔶' },
  { keys: ['perplexity'],                                                        label: 'Perplexity',        icon: '🔍' },
  { keys: ['duck.ai', 'duckduckgo ai'],                                          label: 'Duck.ai',           icon: '🦆' },
  { keys: ['github copilot', 'vibe coding', 'cursor ai'],                        label: 'Vibe Coding',       icon: '💻' },
  { keys: ['ai act', 'eu ai act', 'ai regulation', 'ai wet', 'ai liability'],   label: 'AI Act',            icon: '⚖️' },
  { keys: ['prompt engineering', 'prompting', 'system prompt'],                  label: 'Prompten',          icon: '✏️' },
  { keys: ['ai security', 'ai privacy', 'data security', 'ai veiligheid'],      label: 'AI Veiligheid',     icon: '🔒' },
  { keys: ['ai policy', 'ai governance', 'ai beleid'],                           label: 'AI Beleid',         icon: '📋' },
  { keys: ['ai productivity', 'ai productiviteit', 'ai workflow'],               label: 'AI @ Werk',         icon: '💼' },
  { keys: ['ai literacy', 'ai geletterdheid'],                                   label: 'AI Geletterdheid',  icon: '📖' },
  { keys: ['notuleren', 'meeting transcri', 'notulen'],                          label: 'Notuleren',         icon: '📝' },
  { keys: ['jobcrafting', 'job crafting'],                                       label: 'Jobcrafting',       icon: '🔄' },
  { keys: ['ai leadership', 'ai leiderschap'],                                   label: 'Leiderschap',       icon: '👑' },
];

function calculateTrainerScore(item) {
  const text = ((item.title || '') + ' ' + (item.contentSnippet || item.summary || '')).toLowerCase();
  const toolMatches = TRAINER_TOOL_KEYWORDS.filter(k => text.includes(k)).length;
  const topicMatches = TRAINER_TOPIC_KEYWORDS.filter(k => text.includes(k)).length;
  return Math.min(toolMatches * 2 + topicMatches, 10);
}

function detectTrainerTopics(item) {
  const text = ((item.title || '') + ' ' + (item.contentSnippet || item.summary || '')).toLowerCase();
  const found = [];
  for (const mapping of TRAINER_TOPIC_MAP) {
    if (mapping.keys.some(k => text.includes(k))) {
      found.push({ label: mapping.label, icon: mapping.icon });
      if (found.length >= 3) break;
    }
  }
  return found;
}

// ─── Nieuwsbrief-categorie (voor AVK nieuwsbrief samenstelling) ──────────────
// Prioriteit: wetgeving > toepassingen > tech (default)

const NEWSLETTER_WETGEVING_KEYS = [
  'ai act', 'eu ai act', 'ai regulation', 'ai regulations', 'ai wet', 'ai regelgeving',
  'ai liability', 'ai policy', 'ai policies', 'ai governance', 'ai beleid',
  'ai ethics', 'ethical ai', 'responsible ai', 'ai safety guidelines', 'ai risk framework',
  'ai bias', 'ai fairness', 'ai transparency', 'ai accountability', 'ai oversight',
  'ai ban', 'ai banned', 'ai law ', 'ai laws', 'ai compliance', 'ai audit', 'ai rights',
  'gdpr', 'data protection regulation', 'ai copyright', 'deepfake law', 'ai liability',
];

const NEWSLETTER_TOEPASSINGEN_KEYS = [
  'how to use', 'how to create', 'how to build', 'how to set up', 'how to get',
  'tutorial', 'guide to', 'tips for', 'best practices', 'getting started',
  'workflow', 'use case', 'use cases', 'practical', 'at work', 'for business', 'for teams',
  'ai productivity', 'ai efficiency', 'ai in the workplace', 'ai for your',
  'copilot update', 'copilot feature', 'new copilot', 'copilot in',
  'chatgpt update', 'chatgpt feature', 'chatgpt can', 'new chatgpt',
  'gemini update', 'gemini feature', 'gemini for', 'new gemini',
  'with copilot', 'with chatgpt', 'with gemini', 'using ai',
  'notuleren', 'jobcrafting', 'vibe coding',
  'automation', 'automatisering', 'saves time', 'save time',
];

function classifyNewsletterCategory(item) {
  const text = ((item.title || '') + ' ' + (item.contentSnippet || item.summary || '')).toLowerCase();
  if (NEWSLETTER_WETGEVING_KEYS.some(k => text.includes(k))) return 'wetgeving';
  if (NEWSLETTER_TOEPASSINGEN_KEYS.some(k => text.includes(k))) return 'toepassingen';
  return 'tech';
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

// ─── Grote AI-labs filter voor arXiv Whitepapers ────────────────────────────
// Alleen papers die een van deze labs/modellen noemen worden getoond.
const MAJOR_AI_LAB_KEYWORDS = [
  // OpenAI & modellen
  'openai', 'chatgpt', 'gpt-4', 'gpt-5', 'gpt4', 'gpt-4o', 'dall-e', 'sora', 'whisper',
  // Anthropic & modellen
  'anthropic', 'claude',
  // Google / DeepMind & modellen
  'deepmind', 'google brain', 'google research', 'google ai',
  'gemini', 'gemma', 'vertex ai', 'bard',
  // Meta AI & modellen
  'meta ai', 'meta llama', 'llama', 'facebook ai', 'fair ',
  // Microsoft & modellen
  'microsoft research', 'phi-1', 'phi-2', 'phi-3', 'phi-4',
  // NVIDIA Research
  'nvidia research',
  // Apple ML Research
  'apple intelligence', 'apple ml',
  // DeepSeek
  'deepseek',
  // Mistral AI
  'mistral', 'mixtral',
  // Cohere
  'cohere',
  // Hugging Face
  'hugging face', 'huggingface',
  // xAI
  'grok',
  // Stability AI
  'stability ai', 'stable diffusion',
  // Baidu
  'baidu', 'ernie bot',
  // EleutherAI
  'eleutherai',
  // Databricks
  'databricks', 'dbrx',
];

function isFromMajorAILab(item) {
  // Controleer titel + auteurs + abstract op vermelding van grote AI-labs/modellen
  const text = (
    (item.title || '') + ' ' +
    (item.author || '') + ' ' +
    (item['dc:creator'] || '') + ' ' +
    (item.contentSnippet || item.summary || '').substring(0, 600)
  ).toLowerCase();
  return MAJOR_AI_LAB_KEYWORDS.some(k => text.includes(k));
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

// Per-feed cache: behoudt artikelen bij tijdelijke fouten (bijv. 429)
const feedCache = new Map();

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

      // arXiv-feeds: sla papers over die niet van een groot AI-lab komen
      if (feed.isWhitepaperSource && !isFromMajorAILab(item)) return null;

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
        relevanceScore: calculateRelevanceScore(item),
        trainerScore: calculateTrainerScore(item),
        trainerTopics: detectTrainerTopics(item),
        newsletterCategory: classifyNewsletterCategory(item),
      };
    });
    const filtered = articles.filter(Boolean);
    feedCache.set(feed.name, filtered); // sla succesvolle resultaten op
    return filtered;
  } catch (error) {
    // Bij rate limiting (429): geef gecachte artikelen terug i.p.v. lege lijst
    if (error.message && error.message.includes('429') && feedCache.has(feed.name)) {
      console.warn(`Rate-limit voor ${feed.name}, gecachte artikelen gebruikt`);
      return feedCache.get(feed.name);
    }
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

// ─── Auth middleware helpers ──────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.avk_token;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('avk_token');
    return res.status(401).json({ error: 'Sessie verlopen' });
  }
}

function dbRequired(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Database niet geconfigureerd' });
  next();
}

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', express.json({ limit: '10kb' }), dbRequired, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord verplicht' });
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase().trim())
      .single();
    if (error || !user) return res.status(401).json({ error: 'Onjuiste inloggegevens' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Onjuiste inloggegevens' });
    const displayName = user.name || user.username;
    const token = jwt.sign(
      { sub: user.id, name: displayName, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.cookie('avk_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ name: displayName, username: user.username, role: user.role });
  } catch (err) {
    console.error('Login fout:', err.message);
    res.status(500).json({ error: 'Serverfout' });
  }
});

// POST /api/auth/register — open registratie
app.post('/api/auth/register', express.json({ limit: '10kb' }), dbRequired, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || username.trim().length < 2) return res.status(400).json({ error: 'Gebruikersnaam minimaal 2 tekens' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Wachtwoord minimaal 6 tekens' });
  try {
    const uname = username.trim().toLowerCase();
    const { data: existing } = await supabase.from('users').select('id').eq('username', uname).single();
    if (existing) return res.status(409).json({ error: 'Gebruikersnaam al in gebruik' });
    const password_hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ username: uname, name: username.trim(), password_hash, role: 'trainer' })
      .select()
      .single();
    if (error) throw error;
    const token = jwt.sign(
      { sub: user.id, name: user.name, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.cookie('avk_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ name: user.name, username: user.username, role: user.role });
  } catch (err) {
    console.error('Registratie fout:', err.message);
    res.status(500).json({ error: 'Serverfout' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('avk_token', { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies && req.cookies.avk_token;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ name: user.name, username: user.username, role: user.role });
  } catch {
    res.clearCookie('avk_token');
    return res.status(401).json({ error: 'Sessie verlopen' });
  }
});

// POST /api/admin/invite
app.post('/api/admin/invite', express.json({ limit: '10kb' }), dbRequired, async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Niet toegestaan' });
  }
  const { email, name } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: 'email en name verplicht' });
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('invite_tokens').insert({
      token, email: email.toLowerCase().trim(), name: name.trim(), expires_at
    });
    const inviteUrl = `${req.protocol}://${req.get('host')}/?invite=${token}`;
    res.json({ token, inviteUrl, expires_at });
  } catch (err) {
    console.error('Invite aanmaken mislukt:', err.message);
    res.status(500).json({ error: 'Serverfout' });
  }
});

// GET /api/invite/:token
app.get('/api/invite/:token', dbRequired, async (req, res) => {
  try {
    const { data: invite, error } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token', req.params.token)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (error || !invite) return res.status(404).json({ error: 'Ongeldige of verlopen uitnodiging' });
    res.json({ email: invite.email, name: invite.name });
  } catch (err) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

// POST /api/invite/:token/register
app.post('/api/invite/:token/register', express.json({ limit: '10kb' }), dbRequired, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Wachtwoord minimaal 8 tekens' });
  }
  try {
    const { data: invite, error: invErr } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token', req.params.token)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (invErr || !invite) return res.status(404).json({ error: 'Ongeldige of verlopen uitnodiging' });
    const { data: existing } = await supabase.from('users').select('id').eq('email', invite.email).single();
    if (existing) return res.status(409).json({ error: 'Email is al in gebruik' });
    const password_hash = await bcrypt.hash(password, 12);
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({ name: invite.name, email: invite.email, username: invite.email.split('@')[0], password_hash, role: 'trainer' })
      .select()
      .single();
    if (userErr) throw userErr;
    await supabase.from('invite_tokens').update({ used_at: new Date().toISOString() }).eq('id', invite.id);
    const token = jwt.sign(
      { sub: user.id, name: user.name, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.cookie('avk_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ name: user.name, username: user.username, role: user.role });
  } catch (err) {
    console.error('Registratie mislukt:', err.message);
    res.status(500).json({ error: 'Serverfout' });
  }
});

// GET /api/saved
app.get('/api/saved', requireAuth, dbRequired, async (req, res) => {
  try {
    const { data: saved, error } = await supabase
      .from('saved_articles')
      .select('article_id')
      .eq('user_id', req.user.sub);
    if (error) throw error;
    res.json({ ids: saved.map(s => s.article_id) });
  } catch (err) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

// POST /api/saved
app.post('/api/saved', express.json({ limit: '10kb' }), requireAuth, dbRequired, async (req, res) => {
  const { articleId, title, url } = req.body || {};
  if (!articleId) return res.status(400).json({ error: 'articleId verplicht' });
  try {
    const { error } = await supabase.from('saved_articles').upsert(
      { user_id: req.user.sub, article_id: articleId, article_title: title || '', article_url: url || '' },
      { onConflict: 'user_id,article_id' }
    );
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

// DELETE /api/saved/:articleId
app.delete('/api/saved/:articleId', requireAuth, dbRequired, async (req, res) => {
  try {
    const { error } = await supabase.from('saved_articles')
      .delete()
      .eq('user_id', req.user.sub)
      .eq('article_id', req.params.articleId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Serverfout' });
  }
});

// GET /api/saved/all — alle trainers + hun opgeslagen artikel-IDs (geen auth vereist)
app.get('/api/saved/all', dbRequired, async (req, res) => {
  try {
    const { data: saved, error } = await supabase
      .from('saved_articles')
      .select('article_id, users(name)');
    if (error) throw error;
    const byUser = {};
    for (const s of saved) {
      const name = s.users?.name || 'Onbekend';
      if (!byUser[name]) byUser[name] = [];
      byUser[name].push(s.article_id);
    }
    const users = Object.entries(byUser)
      .map(([name, articleIds]) => ({ name, articleIds }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ users });
  } catch (err) {
    console.error('Saved/all fout:', err.message);
    res.status(500).json({ error: 'Serverfout' });
  }
});

// ─── Einde Auth Routes ────────────────────────────────────

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

// ─── AI Nieuwsbrief schrijven ─────────────────────────────────────────────
async function generateNewsletterItemAI(article, apiKey) {
  const description = (article.description || '').substring(0, 400);
  const prompt = `Jij bent de nieuwsbriefredacteur van AVK Training & Coaching. AVK geeft praktische AI-trainingen aan bedrijven in Nederland.

Schrijf een nieuwsbriefitem voor het volgende artikel, gericht op Nederlandse professionals die AI implementeren in hun werk.

Artikel: "${article.title}"
Bron: ${article.source}
${description ? `Inhoud: ${description}` : ''}

Gebruik precies deze structuur:

**Het nieuws**
[Wat is er precies gebeurd of aangekondigd? 2-3 zinnen.]

**Waarom dit belangrijk is**
[Waarom is dit relevant voor Nederlandse professionals en organisaties die met AI werken? 2-3 zinnen.]

**Welke impact dit heeft**
[Wat betekent dit concreet voor de werkpraktijk? 2-3 zinnen.]

Schrijf in helder, zakelijk Nederlands. Maximaal 120 woorden totaal. Geen hype-taal.`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.65,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.substring(0, 100)}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

function generateNewsletterItemTemplate(article) {
  const desc = (article.description || '').trim();
  const snippet = desc.length > 20
    ? desc.substring(0, 220).trim() + (desc.length > 220 ? '…' : '')
    : 'Zie het volledige artikel voor meer informatie.';

  const categoryInsights = {
    toepassingen: {
      waarom: `Dit is relevant voor iedereen die AI-tools inzet in de dagelijkse werkpraktijk. Praktische toepassingen helpen professionals sneller en efficiënter te werken.`,
      impact: `Organisaties die vroeg adopteren, bouwen een voorsprong op en kunnen medewerkers gericht trainen op nieuwe mogelijkheden.`,
    },
    wetgeving: {
      waarom: `Regelgeving rondom AI raakt vrijwel elke organisatie die AI-systemen gebruikt of inkoopt. Het is essentieel om tijdig compliant te zijn.`,
      impact: `Bedrijven moeten hun AI-beleid en processen mogelijk aanpassen. Tijdig informeren voorkomt juridische risico's en operationele verstoringen.`,
    },
    tech: {
      waarom: `Technologische ontwikkelingen bepalen welke AI-mogelijkheden binnenkort beschikbaar komen voor het bedrijfsleven.`,
      impact: `Dit onderzoek of deze innovatie legt de basis voor toekomstige AI-producten en -diensten die de werkpraktijk verder zullen veranderen.`,
    },
  };

  const cat = article.newsletterCategory || 'tech';
  const insights = categoryInsights[cat] || categoryInsights.tech;

  return `**Het nieuws**\n${snippet}\n\n**Waarom dit belangrijk is**\n${insights.waarom}\n\n**Welke impact dit heeft**\n${insights.impact}`;
}

app.post('/api/newsletter-generate', express.json({ limit: '100kb' }), async (req, res) => {
  const { articles } = req.body || {};
  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: 'Geen artikelen opgegeven' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const toProcess = articles.slice(0, 12); // max 12 artikelen per keer
  const results = [];

  for (const article of toProcess) {
    try {
      const content = apiKey
        ? await generateNewsletterItemAI(article, apiKey)
        : generateNewsletterItemTemplate(article);
      results.push({ id: article.id, content });
    } catch (err) {
      console.error(`Nieuwsbrief genereren mislukt voor "${article.title}":`, err.message);
      results.push({ id: article.id, content: generateNewsletterItemTemplate(article) });
    }
  }

  res.json({ items: results, usedAI: !!apiKey });
});

// ─── Podcast script generator ────────────────────────────────────────────
async function generatePodcastScript(articles, apiKey) {
  const today = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const count = articles.length;

  if (apiKey) {
    const articlesList = articles.map((a, i) =>
      `Bericht ${i + 1}: "${a.title}" — bron: ${a.source}\n${(a.description || '').substring(0, 250)}`
    ).join('\n\n');

    const prompt = `Jij bent de AI-nieuwspresentator van AVK Training & Coaching. Schrijf een volledig podcast-script in het Nederlands voor onderstaande ${count} AI-berichten. Het script wordt uitgesproken via text-to-speech.

Datum: ${today}

${articlesList}

Vereisten:
- Schrijf volledig uitgeschreven zinnen — geen opsommingstekens, geen kopjes, geen markdown
- Begin met een korte begroeting en aankondiging van de datum
- Verwerk elk bericht: wat er is gebeurd, waarom het belangrijk is voor Nederlandse professionals, en welke impact het heeft
- Gebruik vloeiende overgangen tussen berichten zoals "Dan nu ons volgende bericht.", "Ook in het nieuws vandaag:", "Verder:"
- Sluit af met een korte outro en verwijzing naar avk.nl
- Schrijf in de u-vorm, zakelijk maar toegankelijk
- Maximaal 600 woorden totaal`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    return data.choices[0].message.content.trim();
  }

  // ── Template-fallback ──────────────────────────────────────
  const transitions = [
    'Dan nu ons volgende bericht.',
    'Verder in het nieuws.',
    'En dan dit nieuws.',
    'Ook vandaag in het nieuws.',
    'Ons volgende bericht.',
  ];
  const catIntro = {
    toepassingen: 'Op het gebied van AI-toepassingen',
    wetgeving:    'Op het gebied van AI-regelgeving',
    tech:         'In de wereld van AI-technologie',
  };

  let script = `Goedemiddag. Welkom bij het AVK AI Nieuws bulletin van ${today}. `;
  script += `Vandaag neem ik u mee langs ${count} AI-berichten die relevant zijn voor Nederlandse professionals.\n\n`;

  articles.forEach((a, i) => {
    if (i > 0) script += transitions[(i - 1) % transitions.length] + ' ';
    const intro = catIntro[a.newsletterCategory || 'tech'] || 'In het nieuws';
    const desc = (a.description || '').trim().replace(/\s+/g, ' ').substring(0, 200);
    script += `${intro}: ${a.title}. `;
    if (desc) script += desc + ' ';
    script += '\n\n';
  });

  script += 'Dat was het AVK AI Nieuws bulletin van vandaag. Meer AI-nieuws en trainingen vindt u op a-v-k punt en el. Tot de volgende keer.';
  return script;
}

app.post('/api/podcast-script', express.json({ limit: '100kb' }), async (req, res) => {
  const { articles } = req.body || {};
  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: 'Geen artikelen opgegeven' });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const toProcess = articles.slice(0, 10);
  try {
    const script = await generatePodcastScript(toProcess, apiKey);
    res.json({ script, usedAI: !!apiKey, count: toProcess.length });
  } catch (err) {
    console.error('Podcast script mislukt:', err.message);
    const script = await generatePodcastScript(toProcess, null);
    res.json({ script, usedAI: false, count: toProcess.length });
  }
});

// ─── Leg uit: artikel uitleggen in eenvoudige taal ─────────
function generateExplanationTemplate(article) {
  const cat = (article.category || '').toLowerCase();
  let context = '';
  if (cat.includes('whitepaper')) {
    context = 'Dit is een wetenschappelijk onderzoekspapier over kunstmatige intelligentie.';
  } else if (cat.includes('wetgeving') || cat.includes('research')) {
    context = 'Dit gaat over regels, onderzoek of beleid rondom kunstmatige intelligentie.';
  } else if (cat.includes('copilot')) {
    context = 'Dit gaat over Microsoft Copilot, een AI-assistent voor dagelijks werk.';
  } else if (cat.includes('publicatie')) {
    context = 'Dit is een publicatie of rapport over AI-ontwikkelingen.';
  } else {
    context = 'Dit is nieuws over de nieuwste ontwikkelingen in kunstmatige intelligentie.';
  }
  const title = (article.title || '').trim();
  return `${context}\n\nHet artikel "${title}" beschrijft een actuele ontwikkeling in de AI-wereld. Onze trainers kunnen je precies uitleggen wat dit voor jouw werk betekent en hoe je er slim mee aan de slag kunt.`;
}

async function generateExplanationAI(article, apiKey) {
  const desc = (article.description || '').trim().substring(0, 400);
  const prompt = `Je bent een AI-trainer bij AVK Training & Coaching. Leg het volgende AI-nieuwsbericht uit in maximaal 4 korte, begrijpelijke zinnen. Schrijf in eenvoudig Nederlands zonder vakjargon. Maak het direct toepasbaar: wat betekent dit voor gewone medewerkers?

Titel: "${article.title}"${desc ? `\nBeschrijving: "${desc}"` : ''}

Begin direct met de uitleg. Geen introductiezin. Maximaal 80 woorden.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7
    })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

app.post('/api/explain-article', express.json({ limit: '20kb' }), async (req, res) => {
  const { id, title, description, category } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Geen artikel opgegeven' });
  const article = { id, title, description, category };
  const apiKey = process.env.OPENAI_API_KEY;
  try {
    const explanation = apiKey
      ? await generateExplanationAI(article, apiKey)
      : generateExplanationTemplate(article);
    res.json({ explanation, usedAI: !!apiKey });
  } catch (err) {
    console.error('Uitleg mislukt:', err.message);
    res.json({ explanation: generateExplanationTemplate(article), usedAI: false });
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
