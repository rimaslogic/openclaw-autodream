'use strict';

const { extractBullets, extractSections, stripMarkdown } = require('./utils');

/**
 * Keywords/patterns used to classify entries into categories
 */
const CATEGORY_SIGNALS = {
  'People & Relationships': {
    patterns: [
      /\b(?:team|colleague|manager|lead|mentor|mentee|hire|fired|joined|left|role|promotion)\b/i,
      /\b(?:meeting with|spoke to|discussed with|feedback from|review of)\b/i,
      /\b(?:stakeholder|client|customer|partner)\b/i
    ],
    namePattern: /\*\*([A-Z][a-z]+ [A-Z][a-z]+)\*\*/g
  },
  'Projects & Work': {
    patterns: [
      /\b(?:project|milestone|deadline|sprint|deploy|launch|release|shipped|MVP|POC|prototype)\b/i,
      /\b(?:roadmap|backlog|ticket|issue|PR|pull request|merge|branch)\b/i,
      /\b(?:pipeline|revenue|budget|margin|KPI|OKR|metric)\b/i
    ]
  },
  'Preferences & Style': {
    patterns: [
      /\b(?:prefer|preference|style|convention|rule|always use|never use|format|template)\b/i,
      /\b(?:timezone|language|tone|voice|approach)\b/i,
      /\b(?:likes?|dislikes?|hates?|loves?|wants?)\b/i
    ]
  },
  'Technical Decisions': {
    patterns: [
      /\b(?:decided|chose|switched|migrated|adopted|deprecated|replaced)\b/i,
      /\b(?:architecture|stack|framework|library|API|database|schema|infra)\b/i,
      /\b(?:config|setup|install|deploy|CI\/CD|Docker|Kubernetes)\b/i
    ]
  },
  'Important Events': {
    patterns: [
      /\b(?:⚠️|IMPORTANT|CRITICAL|URGENT|breaking|incident|outage|downtime)\b/i,
      /\b(?:announcement|big news|milestone reached|achievement)\b/i,
      /\b(?:deadline|due date|presentation|demo|review)\b/i
    ]
  },
  'Lessons Learned': {
    patterns: [
      /\b(?:lesson|learned|mistake|gotcha|caveat|watch out|pitfall|anti-pattern)\b/i,
      /\b(?:tip|trick|insight|realization|discovery|found out|turns out)\b/i,
      /\b(?:workaround|solution|fix|resolved by|root cause)\b/i
    ]
  }
};

/**
 * Analyze a daily memory file and extract structured entries.
 * @param {string} content - File content
 * @param {string} date - Date string (YYYY-MM-DD) from filename
 * @param {string} source - Source filename
 * @returns {Array} Array of { text, date, source, category, importance, section }
 */
function analyzeFile(content, date, source) {
  if (!content) return [];

  const entries = [];
  const sections = extractSections(content);

  for (const section of sections) {
    const sectionContent = section.content.join('\n');
    const bullets = extractBullets(sectionContent);

    if (bullets.length > 0) {
      for (const bullet of bullets) {
        const category = classifyEntry(bullet.text);
        const importance = scoreImportance(bullet.text);
        entries.push({
          text: bullet.text,
          date,
          source,
          category,
          importance,
          section: section.title
        });
      }
    } else if (sectionContent.trim()) {
      // Non-bullet content under a section header
      const category = classifyEntry(sectionContent);
      const importance = scoreImportance(sectionContent);
      entries.push({
        text: sectionContent.trim(),
        date,
        source,
        category,
        importance,
        section: section.title
      });
    }
  }

  // Handle content before any section header
  const lines = content.split('\n');
  const firstHeaderIdx = lines.findIndex(l => /^#{1,3}\s/.test(l));
  if (firstHeaderIdx > 1) {
    const preamble = lines.slice(1, firstHeaderIdx === -1 ? undefined : firstHeaderIdx).join('\n').trim();
    if (preamble) {
      const bullets = extractBullets(preamble);
      for (const bullet of bullets) {
        entries.push({
          text: bullet.text,
          date,
          source,
          category: classifyEntry(bullet.text),
          importance: scoreImportance(bullet.text),
          section: 'General'
        });
      }
    }
  }

  return entries;
}

/**
 * Classify an entry into a category based on content signals
 */
function classifyEntry(text) {
  const scores = {};

  for (const [category, { patterns }] of Object.entries(CATEGORY_SIGNALS)) {
    let score = 0;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const matches = text.match(pattern);
      if (matches) score += matches.length;
    }
    scores[category] = score;
  }

  // Return highest-scoring category, or 'Projects & Work' as default
  const best = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score > 0);

  return best.length > 0 ? best[0][0] : 'Projects & Work';
}

/**
 * Score the importance of an entry (0-10)
 */
function scoreImportance(text) {
  let score = 5; // Base score

  // High importance markers
  if (/⚠️|IMPORTANT|CRITICAL|NEVER|ALWAYS/i.test(text)) score += 3;
  if (/decided|decision|chose|architecture/i.test(text)) score += 2;
  if (/preference|prefer|rule|convention/i.test(text)) score += 2;
  if (/lesson|learned|mistake|gotcha/i.test(text)) score += 2;

  // Lower importance markers
  if (/tried|attempted|testing|experimenting/i.test(text)) score -= 1;
  if (/minor|small|quick|trivial/i.test(text)) score -= 1;
  if (text.length < 20) score -= 2;

  return Math.max(0, Math.min(10, score));
}

/**
 * Extract named people from entries
 */
function extractPeople(entries) {
  const people = new Map();

  for (const entry of entries) {
    const namePattern = /\*\*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\*\*/g;
    let match;
    while ((match = namePattern.exec(entry.text)) !== null) {
      const name = match[1];
      // Skip common non-name bold words
      if (/^(Note|Warning|Important|Critical|TODO|TIP|Example|Context|Summary|Key|Status|Update|Result)$/i.test(name)) continue;
      if (!people.has(name)) {
        people.set(name, { mentions: 0, contexts: [], firstSeen: entry.date, lastSeen: entry.date });
      }
      const person = people.get(name);
      person.mentions++;
      person.lastSeen = entry.date > person.lastSeen ? entry.date : person.lastSeen;
      if (person.contexts.length < 3) {
        person.contexts.push(entry.text.substring(0, 100));
      }
    }
  }

  return people;
}

/**
 * Extract project names from entries
 */
function extractProjects(entries) {
  const projects = new Map();

  for (const entry of entries) {
    // Match bold terms that look like project names
    const projPattern = /\*\*([A-Z][a-zA-Z0-9\s-]+)\*\*/g;
    let match;
    while ((match = projPattern.exec(entry.text)) !== null) {
      const name = match[1].trim();
      if (name.length > 30 || name.length < 2) continue;
      if (/^(Note|Warning|Important|Critical|TODO|TIP|Key|Status|Update|Result|Current|Target|Decision|Strengths?|Weaknesses?)$/i.test(name)) continue;

      if (!projects.has(name)) {
        projects.set(name, { mentions: 0, contexts: [], firstSeen: entry.date, lastSeen: entry.date });
      }
      const proj = projects.get(name);
      proj.mentions++;
      proj.lastSeen = entry.date > proj.lastSeen ? entry.date : proj.lastSeen;
      if (proj.contexts.length < 3) {
        proj.contexts.push(entry.text.substring(0, 100));
      }
    }
  }

  return projects;
}

module.exports = { analyzeFile, classifyEntry, scoreImportance, extractPeople, extractProjects, CATEGORY_SIGNALS };
