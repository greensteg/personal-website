const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeCardName = (value: string) => value.trim().replace(/\s+/g, ' ');

function cardPlaceholder(reference: string) {
  const [rawName, rawLabel] = reference.split('|');
  const cardName = normalizeCardName(rawName);
  const label = normalizeCardName(rawLabel || rawName);
  return `<span class="mtg-card-slot" data-card-name="${escapeHtml(cardName)}" data-card-label="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

function parseDeckMetadata(deckText: string) {
  const lines = deckText.replace(/\r\n/g, '\n').split('\n');
  const metadata: Record<string, string> = {};
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) {
      cursor += 1;
      break;
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/.exec(line.trim());
    if (!match) break;
    metadata[match[1].toLowerCase()] = match[2].trim();
    cursor += 1;
  }

  return { metadata, rawDeck: lines.slice(cursor).join('\n').trim() };
}

function parseDeckCards(rawDeck: string) {
  const sections: Array<{ name: string; cards: Array<{ qty: number; name: string }> }> = [];
  let current = { name: 'Main Deck', cards: [] as Array<{ qty: number; name: string }> };

  const pushSection = () => {
    if (current.cards.length > 0) sections.push(current);
  };

  for (const rawLine of rawDeck.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const card = /^(\d+)\s*x?\s+(.+)$/.exec(line);
    if (card) {
      current.cards.push({ qty: Number.parseInt(card[1], 10), name: card[2].trim() });
      continue;
    }

    pushSection();
    current = {
      name: /^maindeck$/i.test(line) ? 'Main Deck' : line,
      cards: []
    };
  }

  pushSection();
  return sections;
}

function serializeDeck(deckText: string) {
  const { metadata, rawDeck } = parseDeckMetadata(deckText);
  const deck = {
    title: metadata.title || '',
    format: metadata.format || '',
    sourceUrl: metadata.sourceurl || metadata.source || metadata.url || '',
    sections: parseDeckCards(rawDeck)
  };
  const bytes = new TextEncoder().encode(JSON.stringify(deck));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function preprocessMarkdown(markdown: string) {
  const decks: string[] = [];
  let processed = markdown.replace(/```deck\s*\n([\s\S]*?)\n```/g, (_, deckText: string) => {
    decks.push(serializeDeck(deckText));
    return `\n<div class="mtg-deck-slot" data-deck-index="${decks.length - 1}"></div>\n`;
  });

  const protectedSegments: string[] = [];
  processed = processed.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match) => {
    protectedSegments.push(match);
    return `@@MTG_PROTECTED_${protectedSegments.length - 1}@@`;
  });

  processed = processed.replace(/\[([^\[\]\|]+?)\|(https?:\/\/[^\]\s]+)\]/g, '[$1]($2)');
  processed = processed.replace(/\[\[([^[\]]+?)\]\]/g, (_, reference: string) => cardPlaceholder(reference));
  processed = processed.replace(/@@MTG_PROTECTED_(\d+)@@/g, (_, index: string) => protectedSegments[Number.parseInt(index, 10)]);

  return { markdown: processed, decks };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function tagsFrom(value?: string) {
  return value ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
}

export function excerptMarkdown(markdown: string, limit = 160) {
  const text = markdown
    .replace(/```deck[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, card: string, label?: string) => label || card)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= limit) return text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
}
