function setMetaContent(selector, content) {
    if (!content) {
        return;
    }

    const meta = document.head.querySelector(selector);
    if (meta) {
        meta.setAttribute('content', content);
    }
}

function updatePageMeta({ title, description, url, type = 'website' }) {
    const fullTitle = title ? `${title} - Wentong Zhang` : 'Wentong Zhang';
    const resolvedUrl = url || window.location.href;

    document.title = fullTitle;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', fullTitle);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:type"]', type);
    setMetaContent('meta[property="og:url"]', resolvedUrl);
    setMetaContent('meta[name="twitter:title"]', fullTitle);
    setMetaContent('meta[name="twitter:description"]', description);
}

function excerptMarkdown(markdown, maxLength = 160) {
    const text = String(markdown || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*_>`-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}
