(function(global) {
    const memoryCardCache = new Map();
    const storagePrefix = 'mtg-card-cache:';
    const storageTtlMs = 1000 * 60 * 60 * 24 * 7;
    let previewRoot = null;
    let previewAnchor = null;
    let previewHideTimer = null;
    let stylesInjected = false;

    function ensureStyles() {
        if (stylesInjected || !global.document) {
            return;
        }

        const style = document.createElement('style');
        style.textContent = `
            .mtg-card-link {
                color: #1d4ed8;
                text-decoration: underline;
                text-decoration-style: dotted;
                text-underline-offset: 0.18em;
                cursor: pointer;
            }

            .mtg-card-link:hover,
            .mtg-card-link:focus-visible {
                color: #1e40af;
            }

            .mtg-card-link:focus-visible {
                outline: 2px solid #3b82f6;
                outline-offset: 2px;
                border-radius: 0.125rem;
            }

            .mtg-card-preview {
                position: fixed;
                z-index: 80;
                width: min(260px, calc(100vw - 2rem));
                border-radius: 0.5rem;
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid rgba(148, 163, 184, 0.45);
                box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
                padding: 0.5rem;
                backdrop-filter: blur(6px);
            }

            .mtg-card-preview[hidden] {
                display: none;
            }

            .mtg-card-preview img {
                display: block;
                width: 100%;
                height: auto;
                border-radius: 0.4rem;
            }

            .mtg-card-preview-title {
                display: block;
                margin-top: 0.5rem;
                font-size: 0.875rem;
                color: #0f172a;
                text-decoration: none;
            }
        `;

        document.head.appendChild(style);
        stylesInjected = true;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function encodeDataAttribute(value) {
        return escapeHtml(value).replace(/"/g, '&quot;');
    }

    function normalizeCardName(name) {
        return String(name || '').trim().replace(/\s+/g, ' ');
    }

    function storageKey(cardName) {
        return storagePrefix + normalizeCardName(cardName).toLowerCase();
    }

    function readStoredCard(cardName) {
        try {
            const raw = global.localStorage && localStorage.getItem(storageKey(cardName));
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed.expiresAt || parsed.expiresAt < Date.now() || !parsed.data) {
                localStorage.removeItem(storageKey(cardName));
                return null;
            }

            return parsed.data;
        } catch (error) {
            return null;
        }
    }

    function writeStoredCard(cardName, data) {
        try {
            if (!global.localStorage) {
                return;
            }

            localStorage.setItem(storageKey(cardName), JSON.stringify({
                data,
                expiresAt: Date.now() + storageTtlMs
            }));
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function getPreviewImage(card) {
        if (card.image_uris) {
            return card.image_uris.normal || card.image_uris.large || card.image_uris.small || null;
        }

        if (Array.isArray(card.card_faces)) {
            for (const face of card.card_faces) {
                if (face.image_uris) {
                    return face.image_uris.normal || face.image_uris.large || face.image_uris.small || null;
                }
            }
        }

        return null;
    }

    function sanitizeCardPayload(card) {
        return {
            name: card.name,
            scryfall_uri: card.scryfall_uri || null,
            previewImage: getPreviewImage(card),
            layout: card.layout || null
        };
    }

    async function fetchCard(cardName) {
        const normalized = normalizeCardName(cardName);
        if (!normalized) {
            return null;
        }

        if (memoryCardCache.has(normalized)) {
            return memoryCardCache.get(normalized);
        }

        const stored = readStoredCard(normalized);
        if (stored) {
            memoryCardCache.set(normalized, stored);
            return stored;
        }

        try {
            const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(normalized)}`);
            if (!response.ok) {
                return null;
            }

            const payload = await response.json();
            const sanitized = sanitizeCardPayload(payload);
            memoryCardCache.set(normalized, sanitized);
            writeStoredCard(normalized, sanitized);
            return sanitized;
        } catch (error) {
            console.error(`Failed to load MTG card "${normalized}"`, error);
            return null;
        }
    }

    function ensurePreviewRoot() {
        ensureStyles();
        if (previewRoot) {
            return previewRoot;
        }

        previewRoot = document.createElement('div');
        previewRoot.className = 'mtg-card-preview';
        previewRoot.hidden = true;
        previewRoot.addEventListener('mouseenter', cancelPreviewHide);
        previewRoot.addEventListener('mouseleave', schedulePreviewHide);
        document.body.appendChild(previewRoot);
        return previewRoot;
    }

    function cancelPreviewHide() {
        if (previewHideTimer) {
            clearTimeout(previewHideTimer);
            previewHideTimer = null;
        }
    }

    function schedulePreviewHide() {
        cancelPreviewHide();
        previewHideTimer = setTimeout(hidePreview, 120);
    }

    function hidePreview() {
        cancelPreviewHide();
        if (previewRoot) {
            previewRoot.hidden = true;
        }
        previewAnchor = null;
    }

    function renderPreviewBody(card) {
        const href = card.scryfall_uri ? escapeHtml(card.scryfall_uri) : '#';
        const title = escapeHtml(card.name);
        const image = card.previewImage
            ? `<a href="${href}" target="_blank" rel="noreferrer noopener"><img src="${escapeHtml(card.previewImage)}" alt="${title}"></a>`
            : `<div class="text-sm text-slate-600">Preview unavailable.</div>`;

        const footer = card.scryfall_uri
            ? `<a class="mtg-card-preview-title" href="${href}" target="_blank" rel="noreferrer noopener">${title}</a>`
            : `<span class="mtg-card-preview-title">${title}</span>`;

        return `${image}${footer}`;
    }

    function positionPreview(anchor) {
        if (!previewRoot) {
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const previewRect = previewRoot.getBoundingClientRect();
        const gap = 12;

        let top = rect.top;
        let left = rect.right + gap;

        if (left + previewRect.width > window.innerWidth - 16) {
            left = rect.left - previewRect.width - gap;
        }

        if (left < 16) {
            left = Math.max(16, Math.min(window.innerWidth - previewRect.width - 16, rect.left));
            top = rect.bottom + gap;
        }

        if (top + previewRect.height > window.innerHeight - 16) {
            top = Math.max(16, window.innerHeight - previewRect.height - 16);
        }

        previewRoot.style.left = `${left}px`;
        previewRoot.style.top = `${top}px`;
    }

    function showPreview(anchor, card) {
        const root = ensurePreviewRoot();
        cancelPreviewHide();
        previewAnchor = anchor;
        root.innerHTML = renderPreviewBody(card);
        root.hidden = false;
        positionPreview(anchor);
    }

    function isCoarsePointer() {
        return global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    }

    function createCardLink(cardName, cardData) {
        const name = normalizeCardName(cardName);
        if (!cardData) {
            const fallback = document.createElement('span');
            fallback.textContent = name;
            fallback.className = 'text-gray-700';
            return fallback;
        }

        const link = document.createElement('a');
        link.textContent = name;
        link.className = 'mtg-card-link';
        link.href = cardData.scryfall_uri || '#';
        link.target = '_blank';
        link.rel = 'noreferrer noopener';

        link.addEventListener('mouseenter', () => showPreview(link, cardData));
        link.addEventListener('mouseleave', schedulePreviewHide);
        link.addEventListener('focus', () => showPreview(link, cardData));
        link.addEventListener('blur', schedulePreviewHide);
        link.addEventListener('click', event => {
            if (!isCoarsePointer()) {
                return;
            }

            if (previewAnchor !== link || !previewRoot || previewRoot.hidden) {
                event.preventDefault();
                showPreview(link, cardData);
            }
        });

        return link;
    }

    function buildCardPlaceholder(cardName) {
        return `<span class="mtg-card-slot" data-card-name="${encodeDataAttribute(normalizeCardName(cardName))}">${escapeHtml(normalizeCardName(cardName))}</span>`;
    }

    function toBase64(value) {
        if (typeof btoa === 'function') {
            return btoa(unescape(encodeURIComponent(value)));
        }

        return Buffer.from(value, 'utf8').toString('base64');
    }

    function fromBase64(value) {
        if (typeof atob === 'function') {
            return decodeURIComponent(escape(atob(value)));
        }

        return Buffer.from(value, 'base64').toString('utf8');
    }

    function serializeDeck(data) {
        return toBase64(JSON.stringify(data));
    }

    function deserializeDeck(value) {
        return JSON.parse(fromBase64(value));
    }

    function parseDeckMetadata(deckText) {
        const lines = deckText.replace(/\r\n/g, '\n').split('\n');
        const metadata = {};
        let cursor = 0;

        while (cursor < lines.length) {
            const line = lines[cursor];
            if (!line.trim()) {
                cursor += 1;
                break;
            }

            const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/.exec(line.trim());
            if (!match) {
                break;
            }

            metadata[match[1]] = match[2].trim();
            cursor += 1;
        }

        return {
            metadata,
            rawDeck: lines.slice(cursor).join('\n').trim()
        };
    }

    function normalizeSectionName(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            return 'Main Deck';
        }

        if (/^maindeck$/i.test(trimmed)) {
            return 'Main Deck';
        }

        return trimmed;
    }

    function parseDeckCards(rawDeck) {
        const lines = rawDeck.replace(/\r\n/g, '\n').split('\n');
        const sections = [];
        let currentSection = {
            name: 'Main Deck',
            cards: []
        };

        function pushCurrentSection() {
            if (currentSection.cards.length > 0) {
                sections.push(currentSection);
            }
        }

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                continue;
            }

            const cardMatch = /^(\d+)\s*x?\s+(.+)$/.exec(line);
            if (cardMatch) {
                currentSection.cards.push({
                    qty: parseInt(cardMatch[1], 10),
                    name: cardMatch[2].trim()
                });
                continue;
            }

            pushCurrentSection();
            currentSection = {
                name: normalizeSectionName(line),
                cards: []
            };
        }

        pushCurrentSection();
        return sections;
    }

    function parseDeckBlock(deckText) {
        const { metadata, rawDeck } = parseDeckMetadata(deckText);
        return {
            title: metadata.title || '',
            format: metadata.format || '',
            sourceUrl: metadata.sourceUrl || metadata.source || metadata.url || '',
            sections: parseDeckCards(rawDeck)
        };
    }

    function deckToPlainText(deck) {
        const lines = [];
        if (deck.title) {
            lines.push(deck.title);
        }
        if (deck.format) {
            lines.push(deck.format);
        }
        if (deck.sourceUrl) {
            lines.push(deck.sourceUrl);
        }
        if (lines.length > 0) {
            lines.push('');
        }

        deck.sections.forEach((section, index) => {
            if (deck.sections.length > 1 || section.name !== 'Main Deck') {
                lines.push(section.name);
            }
            section.cards.forEach(card => {
                lines.push(`${card.qty} ${card.name}`);
            });
            if (index < deck.sections.length - 1) {
                lines.push('');
            }
        });

        return lines.join('\n');
    }

    function createDeckList(deck) {
        const wrapper = document.createElement('section');
        wrapper.className = 'mtg-deck-root my-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5';

        const header = document.createElement('div');
        header.className = 'mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between';

        const heading = document.createElement('div');
        heading.className = 'min-w-0';

        if (deck.title) {
            const title = document.createElement('h2');
            title.textContent = deck.title;
            title.className = 'text-lg font-medium text-slate-900';
            heading.appendChild(title);
        }

        if (deck.format || deck.sourceUrl) {
            const meta = document.createElement('div');
            meta.className = 'mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500';

            if (deck.format) {
                const format = document.createElement('span');
                format.textContent = deck.format;
                meta.appendChild(format);
            }

            if (deck.sourceUrl) {
                const source = document.createElement('a');
                source.href = deck.sourceUrl;
                source.target = '_blank';
                source.rel = 'noreferrer noopener';
                source.className = 'text-blue-600 underline hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded';
                source.textContent = 'Source';
                meta.appendChild(source);
            }

            heading.appendChild(meta);
        }

        const actions = document.createElement('div');
        actions.className = 'flex shrink-0 items-center gap-2';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
        copyButton.textContent = 'Copy decklist';
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(deckToPlainText(deck));
                copyButton.textContent = 'Copied';
                setTimeout(() => {
                    copyButton.textContent = 'Copy decklist';
                }, 1200);
            } catch (error) {
                copyButton.textContent = 'Copy failed';
                setTimeout(() => {
                    copyButton.textContent = 'Copy decklist';
                }, 1200);
            }
        });

        actions.appendChild(copyButton);
        header.appendChild(heading);
        header.appendChild(actions);
        wrapper.appendChild(header);

        const sectionsGrid = document.createElement('div');
        sectionsGrid.className = 'space-y-5';

        deck.sections.forEach(section => {
            const sectionEl = document.createElement('section');

            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = section.name;
            sectionTitle.className = 'mb-2 text-sm font-medium uppercase tracking-wide text-slate-500';
            sectionEl.appendChild(sectionTitle);

            const list = document.createElement('ul');
            list.className = 'space-y-1';

            section.cards.forEach(card => {
                const item = document.createElement('li');
                item.className = 'flex items-baseline gap-3 text-sm sm:text-base';

                const qty = document.createElement('span');
                qty.textContent = String(card.qty);
                qty.className = 'w-7 shrink-0 text-right font-medium text-slate-500';

                const name = document.createElement('span');
                name.className = 'min-w-0 text-slate-700';
                name.appendChild(createCardLink(card.name, null));
                hydrateCardReference(name.firstChild, card.name);

                item.appendChild(qty);
                item.appendChild(name);
                list.appendChild(item);
            });

            sectionEl.appendChild(list);
            sectionsGrid.appendChild(sectionEl);
        });

        wrapper.appendChild(sectionsGrid);
        return wrapper;
    }

    function preprocessMarkdown(markdown) {
        const deckPlaceholders = [];
        let processed = markdown.replace(/```deck\s*\n([\s\S]*?)\n```/g, (_, deckText) => {
            const deck = parseDeckBlock(deckText);
            const encodedDeck = serializeDeck(deck);
            deckPlaceholders.push(encodedDeck);
            return `\n<div class="mtg-deck-slot" data-deck-index="${deckPlaceholders.length - 1}"></div>\n`;
        });

        const protectedSegments = [];
        processed = processed.replace(/```[\s\S]*?```|`[^`\n]+`/g, match => {
            protectedSegments.push(match);
            return `@@MTG_PROTECTED_${protectedSegments.length - 1}@@`;
        });

        processed = processed.replace(/\[\[([^[\]]+?)\]\]/g, (_, cardName) => buildCardPlaceholder(cardName));

        processed = processed.replace(/@@MTG_PROTECTED_(\d+)@@/g, (_, index) => protectedSegments[parseInt(index, 10)]);

        return {
            markdown: processed,
            decks: deckPlaceholders
        };
    }

    async function hydrateCardReference(node, fallbackName) {
        const cardName = fallbackName || (node && node.dataset ? node.dataset.cardName : '');
        if (!node || !cardName) {
            return;
        }

        const parent = node.parentNode;
        const card = await fetchCard(cardName);
        const replacement = createCardLink(cardName, card);
        if (parent) {
            parent.replaceChild(replacement, node);
        }
    }

    function hydrateDeckSlots(container) {
        container.querySelectorAll('.mtg-deck-slot').forEach(slot => {
            const encoded = slot.dataset.deckIndex;
            if (encoded == null) {
                return;
            }

            const deckData = container.__mtgDecks && container.__mtgDecks[parseInt(encoded, 10)];
            if (!deckData) {
                return;
            }

            const deck = deserializeDeck(deckData);
            slot.replaceWith(createDeckList(deck));
        });
    }

    function enhanceMtgContent(container) {
        ensureStyles();
        hydrateDeckSlots(container);
        container.querySelectorAll('.mtg-card-slot').forEach(slot => {
            hydrateCardReference(slot);
        });
    }

    function renderMarkdown(markdown) {
        const processed = preprocessMarkdown(markdown);
        return {
            html: marked.parse(processed.markdown),
            decks: processed.decks
        };
    }

    const api = {
        renderMarkdown,
        enhanceMtgContent,
        parseDeckBlock,
        parseDeckCards,
        deckToPlainText,
        preprocessMarkdown
    };

    global.MtgContent = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
