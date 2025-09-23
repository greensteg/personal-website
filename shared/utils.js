// Shared utility functions

// Simple markdown parser for front matter
function parseFrontMatter(content) {
    if (!content.startsWith('---')) {
        return { frontMatter: {}, content: content };
    }
    
    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
        return { frontMatter: {}, content: content };
    }
    
    const frontMatterText = content.slice(3, endIndex).trim();
    const mainContent = content.slice(endIndex + 3).trim();
    
    const frontMatter = {};
    frontMatterText.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
            frontMatter[key] = value;
        }
    });
    
    return { frontMatter, content: mainContent };
}

// Load content from markdown files
async function loadContent(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const content = await response.text();
        return content;
    } catch (error) {
        console.error(`Failed to load ${filePath}:`, error);
        return null;
    }
}

// Load and render markdown content
async function renderMarkdownContent(containerId, filePath) {
    const content = await loadContent(filePath);
    
    if (!content) {
        const container = document.getElementById(containerId);
        container.innerHTML = '<p class="text-red-500">Error: Could not load content from ' + filePath + '</p>';
        return;
    }
    
    const { frontMatter, content: markdownContent } = parseFrontMatter(content);
    const html = marked.parse(markdownContent);
    
    const container = document.getElementById(containerId);
    container.innerHTML = html;
    
    // Apply styling to rendered content
    applyContentStyling(container);
}

// Apply Tailwind styling to rendered markdown
function applyContentStyling(container) {
    // Style headings
    container.querySelectorAll('h1').forEach(h1 => {
        h1.className = 'text-5xl font-light mb-6 text-gray-900';
        // Handle name styling in h1
        if (h1.textContent.includes("I'm Wentong")) {
            h1.innerHTML = h1.innerHTML.replace('Wentong', '<span class="font-medium">Wentong</span>');
        }
    });
    
    container.querySelectorAll('h2').forEach(h2 => {
        h2.className = 'text-2xl font-medium text-gray-900 mb-6 mt-8';
    });
    
    container.querySelectorAll('h3').forEach(h3 => {
        h3.className = 'text-xl font-medium text-gray-900 mb-4 mt-6';
    });
    
    // Style paragraphs
    container.querySelectorAll('p').forEach((p, index) => {
        if (index === 0 && container.id === 'aboutContent') {
            p.className = 'text-xl text-gray-600 mb-8 leading-relaxed';
        } else {
            p.className = 'text-gray-600 leading-relaxed mb-6';
        }
    });
    
    // Style links
    container.querySelectorAll('a').forEach(a => {
        a.className = 'text-gray-900 underline hover:text-gray-600 transition-colors';
    });
    
    // Style lists
    container.querySelectorAll('ul').forEach(ul => {
        ul.className = 'space-y-2 mb-6';
    });
    
    container.querySelectorAll('li').forEach(li => {
        li.className = 'text-gray-600';
    });

    // Style blockquotes
    container.querySelectorAll('blockquote').forEach(bq => {
        bq.className = 'border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-6';
    });

    // Style code blocks
    container.querySelectorAll('pre').forEach(pre => {
        pre.className = 'bg-gray-100 rounded-lg p-4 overflow-x-auto mb-6';
    });

    container.querySelectorAll('code').forEach(code => {
        if (code.parentElement.tagName !== 'PRE') {
            code.className = 'bg-gray-100 rounded px-1 py-0.5 text-sm';
        }
    });
}