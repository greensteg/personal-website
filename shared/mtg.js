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
                text-decoration-thickness: 1.5px;
                text-underline-offset: 0.2em;
                cursor: pointer;
                transition: color 0.15s ease, text-decoration-color 0.15s ease;
            }

            .mtg-card-link:hover,
            .mtg-card-link:focus-visible {
                color: #1e40af;
                text-decoration-style: solid;
            }

            .mtg-card-link:focus-visible {
                outline: 2px solid #3b82f6;
                outline-offset: 2px;
                border-radius: 0.125rem;
            }

            .mtg-card-preview {
                position: fixed;
                z-index: 80;
                width: min(280px, calc(100vw - 2rem));
                border-radius: 0.75rem;
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid rgba(148, 163, 184, 0.3);
                box-shadow:
                    0 4px 6px -1px rgba(15, 23, 42, 0.06),
                    0 20px 40px -4px rgba(15, 23, 42, 0.16);
                padding: 0.5rem;
                backdrop-filter: blur(8px);
                opacity: 0;
                transform: scale(0.96) translateY(4px);
                transition: opacity 0.18s ease, transform 0.18s ease;
                pointer-events: auto;
            }

            .mtg-card-preview.mtg-card-preview--visible {
                opacity: 1;
                transform: scale(1) translateY(0);
            }

            .mtg-card-preview[hidden] {
                display: none;
            }

            .mtg-card-preview img {
                display: block;
                width: 100%;
                height: auto;
                border-radius: 0.6rem;
            }


            /* ── Deck list block ── */

            .mtg-deck-root {
                margin: 2rem 0;
                border: 1px solid #e2e8f0;
                border-radius: 0.625rem;
                background: #fff;
                box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
                overflow: hidden;
            }

            .mtg-deck-header {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 0.75rem;
                padding: 1rem 1.25rem;
                border-bottom: 1px solid #e2e8f0;
                background: #f8fafc;
            }

            .mtg-deck-header-left {
                min-width: 0;
            }

            .mtg-deck-title {
                margin: 0;
                font-size: 0.9375rem;
                font-weight: 600;
                color: #0f172a;
                letter-spacing: 0.01em;
                line-height: 1.3;
            }

            .mtg-deck-meta {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 0.375rem 0.625rem;
                margin-top: 0.25rem;
                font-size: 0.75rem;
                color: #64748b;
            }

            .mtg-deck-meta a {
                color: #3b82f6;
                text-decoration: none;
            }

            .mtg-deck-meta a:hover {
                text-decoration: underline;
            }

            .mtg-deck-meta-sep {
                color: #cbd5e1;
            }

            .mtg-deck-body {
                display: flex;
                min-height: 0;
            }

            .mtg-deck-cards {
                flex: 1;
                min-width: 0;
                padding: 1rem 1.25rem;
                overflow-y: auto;
                max-height: 32rem;
            }

            .mtg-deck-section + .mtg-deck-section {
                margin-top: 1.25rem;
                padding-top: 1rem;
                border-top: 1px solid #f1f5f9;
            }

            .mtg-deck-section-title {
                margin: 0 0 0.5rem;
                font-size: 0.6875rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: #94a3b8;
            }

            .mtg-deck-list {
                list-style: none;
                margin: 0;
                padding: 0;
            }

            .mtg-deck-card {
                display: flex;
                align-items: baseline;
                gap: 0.5rem;
                padding: 0.1875rem 0.375rem;
                border-radius: 0.25rem;
                font-size: 0.8125rem;
                line-height: 1.5;
                transition: background-color 0.1s ease;
            }

            .mtg-deck-card:hover {
                background: #f8fafc;
            }

            .mtg-deck-card-qty {
                flex-shrink: 0;
                width: 1.25rem;
                text-align: right;
                font-variant-numeric: tabular-nums;
                color: #94a3b8;
                font-weight: 500;
            }

            .mtg-deck-card-name {
                min-width: 0;
                color: #334155;
            }

            /* ── Deck preview pane ── */

            .mtg-deck-preview-pane {
                display: none;
                width: 13rem;
                flex-shrink: 0;
                border-left: 1px solid #e2e8f0;
                background: #f8fafc;
                padding: 1rem;
                align-items: flex-start;
                justify-content: center;
            }

            @media (min-width: 640px) {
                .mtg-deck-preview-pane {
                    display: flex;
                }
            }

            .mtg-deck-preview-inner {
                width: 100%;
                aspect-ratio: 488 / 680;
                border-radius: 0.5rem;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f1f5f9;
                position: sticky;
                top: 1rem;
            }

            .mtg-deck-preview-inner img {
                display: block;
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 0.5rem;
                opacity: 0;
                transition: opacity 0.2s ease;
            }

            .mtg-deck-preview-inner img.mtg-deck-img-loaded {
                opacity: 1;
            }

            .mtg-deck-preview-placeholder {
                font-size: 0.6875rem;
                color: #94a3b8;
                text-align: center;
                padding: 0.5rem;
            }

            .mtg-deck-copy-btn {
                appearance: none;
                border: 1px solid #e2e8f0;
                border-radius: 0.375rem;
                background: #fff;
                padding: 0.3125rem 0.625rem;
                font-size: 0.6875rem;
                font-weight: 500;
                color: #64748b;
                cursor: pointer;
                white-space: nowrap;
                transition: border-color 0.15s ease, color 0.15s ease;
            }

            .mtg-deck-copy-btn:hover {
                border-color: #cbd5e1;
                color: #334155;
            }

            .mtg-deck-footer {
                display: flex;
                justify-content: flex-end;
                padding: 0.625rem 1.25rem;
                border-top: 1px solid #f1f5f9;
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
            previewRoot.classList.remove('mtg-card-preview--visible');
            setTimeout(() => {
                if (!previewRoot.classList.contains('mtg-card-preview--visible')) {
                    previewRoot.hidden = true;
                }
            }, 180);
        }
        previewAnchor = null;
    }

    function renderPreviewBody(card) {
        const href = card.scryfall_uri ? escapeHtml(card.scryfall_uri) : '#';
        const title = escapeHtml(card.name);
        const image = card.previewImage
            ? `<a href="${href}" target="_blank" rel="noreferrer noopener"><img src="${escapeHtml(card.previewImage)}" alt="${title}"></a>`
            : `<div class="text-sm text-slate-600">Preview unavailable.</div>`;

        return image;
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
        root.classList.remove('mtg-card-preview--visible');
        root.hidden = false;
        positionPreview(anchor);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                root.classList.add('mtg-card-preview--visible');
            });
        });
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
        wrapper.className = 'mtg-deck-root';

        // ── Header ──
        const header = document.createElement('div');
        header.className = 'mtg-deck-header';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'mtg-deck-header-left';

        if (deck.title) {
            const title = document.createElement('h2');
            title.textContent = deck.title;
            title.className = 'mtg-deck-title';
            headerLeft.appendChild(title);
        }

        if (deck.format || deck.sourceUrl) {
            const meta = document.createElement('div');
            meta.className = 'mtg-deck-meta';

            if (deck.format) {
                const format = document.createElement('span');
                format.textContent = deck.format;
                meta.appendChild(format);
            }

            if (deck.format && deck.sourceUrl) {
                const sep = document.createElement('span');
                sep.className = 'mtg-deck-meta-sep';
                sep.textContent = '·';
                meta.appendChild(sep);
            }

            if (deck.sourceUrl) {
                const source = document.createElement('a');
                source.href = deck.sourceUrl;
                source.target = '_blank';
                source.rel = 'noreferrer noopener';
                source.textContent = 'View source';
                meta.appendChild(source);
            }

            headerLeft.appendChild(meta);
        }

        header.appendChild(headerLeft);
        wrapper.appendChild(header);

        // ── Body: cards + preview ──
        const body = document.createElement('div');
        body.className = 'mtg-deck-body';

        const cardsPane = document.createElement('div');
        cardsPane.className = 'mtg-deck-cards';

        // Preview pane (desktop only)
        const previewPane = document.createElement('div');
        previewPane.className = 'mtg-deck-preview-pane';

        const previewInner = document.createElement('div');
        previewInner.className = 'mtg-deck-preview-inner';

        const previewPlaceholder = document.createElement('div');
        previewPlaceholder.className = 'mtg-deck-preview-placeholder';
        previewPlaceholder.textContent = 'Hover a card';
        previewInner.appendChild(previewPlaceholder);
        previewPane.appendChild(previewInner);

        function showDeckPreview(cardName) {
            fetchCard(cardName).then(cardData => {
                if (!cardData || !cardData.previewImage) {
                    return;
                }

                const existing = previewInner.querySelector('img');
                if (existing && existing.dataset.cardName === cardName) {
                    return;
                }

                const img = document.createElement('img');
                img.dataset.cardName = cardName;
                img.alt = cardName;
                img.src = cardData.previewImage;
                img.onload = () => img.classList.add('mtg-deck-img-loaded');

                previewInner.innerHTML = '';
                previewInner.appendChild(img);
            });
        }

        deck.sections.forEach((section, index) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'mtg-deck-section';

            const sectionTitle = document.createElement('h3');
            sectionTitle.className = 'mtg-deck-section-title';
            const count = section.cards.reduce((sum, c) => sum + c.qty, 0);
            sectionTitle.textContent = `${section.name} (${count})`;
            sectionEl.appendChild(sectionTitle);

            const list = document.createElement('ul');
            list.className = 'mtg-deck-list';

            section.cards.forEach(card => {
                const item = document.createElement('li');
                item.className = 'mtg-deck-card';

                const qty = document.createElement('span');
                qty.textContent = String(card.qty);
                qty.className = 'mtg-deck-card-qty';

                const name = document.createElement('span');
                name.className = 'mtg-deck-card-name';
                name.appendChild(createCardLink(card.name, null));
                hydrateCardReference(name.firstChild, card.name);

                item.appendChild(qty);
                item.appendChild(name);

                item.addEventListener('mouseenter', () => showDeckPreview(card.name));

                list.appendChild(item);
            });

            sectionEl.appendChild(list);
            cardsPane.appendChild(sectionEl);
        });

        body.appendChild(cardsPane);
        body.appendChild(previewPane);
        wrapper.appendChild(body);

        // ── Footer with copy button ──
        const footer = document.createElement('div');
        footer.className = 'mtg-deck-footer';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'mtg-deck-copy-btn';
        copyButton.textContent = 'Copy decklist';
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(deckToPlainText(deck));
                copyButton.textContent = 'Copied!';
                setTimeout(() => { copyButton.textContent = 'Copy decklist'; }, 1200);
            } catch (error) {
                copyButton.textContent = 'Failed';
                setTimeout(() => { copyButton.textContent = 'Copy decklist'; }, 1200);
            }
        });

        footer.appendChild(copyButton);
        wrapper.appendChild(footer);

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

        processed = processed.replace(/\[([^\[\]\|]+?)\|(https?:\/\/[^\]\s]+)\]/g, (_, label, url) => {
            return `[${label}](${url})`;
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
