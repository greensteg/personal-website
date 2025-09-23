// Shared navigation component
function createNavigation(currentPage = '') {
    const nav = document.createElement('nav');
    nav.className = 'fixed top-0 w-full bg-white/80 backdrop-blur-sm border-b border-gray-200 z-50';
    
    nav.innerHTML = `
        <div class="max-w-4xl mx-auto px-6 py-4">
            <div class="flex justify-between items-center">
                <a href="index.html" class="font-semibold text-lg">Wentong Zhang</a>
                <div class="space-x-6">
                    <a href="index.html" class="nav-link ${currentPage === 'about' ? 'text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-900 transition-colors'}">About</a>
                    <a href="thoughts.html" class="nav-link ${currentPage === 'thoughts' ? 'text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-900 transition-colors'}">Thoughts</a>
                    <a href="contact.html" class="nav-link ${currentPage === 'contact' ? 'text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-900 transition-colors'}">Contact</a>
                </div>
            </div>
        </div>
    `;
    
    return nav;
}

// Helper function to determine the correct base path
function getBasePath() {
    const path = window.location.pathname;
    
    // If we're in the root or on index.html, no prefix needed
    if (path === '/' || path.endsWith('index.html') || path.endsWith('thoughts.html') || path.endsWith('contact.html') || path.endsWith('post.html')) {
        return './';
    }
    
    // For any other case, go up one level
    return '../';
}

// Initialize navigation on page load
function initNavigation(currentPage = '') {
    document.addEventListener('DOMContentLoaded', function() {
        const body = document.body;
        const nav = createNavigation(currentPage);
        body.insertBefore(nav, body.firstChild);
    });
}