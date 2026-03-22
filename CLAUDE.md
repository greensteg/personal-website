# Personal Website - Project Overview

## Project Description
A minimalist personal portfolio website for Wentong Zhang, featuring an about page, blog (thoughts), and contact information. The site uses a clean, simple design with vanilla JavaScript and Tailwind CSS for styling.

## Tech Stack
- **Frontend Framework**: Vanilla JavaScript (no framework)
- **Styling**: Tailwind CSS (via CDN)
- **Markdown Processing**: marked.js (via CDN)
- **Build System**: None (static site)
- **Package Manager**: None (no package.json)
- **Version Control**: Git

## Project Structure
```
/
├── index.html           # About page (main landing)
├── thoughts.html        # Blog listing page
├── post.html           # Individual blog post viewer
├── contact.html        # Contact page
├── content/            # Markdown content files
│   ├── about.md       # About page content
│   ├── contact.md     # Contact page content
│   └── posts/         # Blog posts
│       ├── index.json # Posts registry
│       └── post-1.md  # Example blog post
├── shared/            # Shared JavaScript utilities
│   ├── nav.js        # Navigation component
│   └── utils.js      # Markdown parsing and rendering utilities
├── Dockerfile          # Caddy 2 container image
├── docker-compose.yml  # Container orchestration
├── Caddyfile           # Web server config (domain, HTTPS, caching)
├── justfile            # Task runner commands
└── scripts/
    ├── deploy.sh       # Build and start container
    └── autodeploy.sh   # Manage cron-based auto-deploy
```

## Key Features
1. **Dynamic Navigation**: Shared navigation component automatically inserted on all pages
2. **Markdown Content**: All content stored as markdown files for easy editing
3. **Blog System**: Auto-discovery of posts from `index.json` registry
4. **Front Matter Support**: Blog posts support YAML front matter for metadata
5. **Responsive Design**: Mobile-friendly using Tailwind CSS

## Code Conventions

### HTML Structure
- Each page follows the same template with navigation placeholder
- Uses semantic HTML5 elements
- Tailwind classes for all styling (no custom CSS except smooth scrolling)

### JavaScript Patterns
- Modular approach with shared utilities
- Functions use async/await for content loading
- DOM manipulation after DOMContentLoaded event
- No external dependencies beyond CDN libraries

### Content Management
- All content in markdown format
- Blog posts require front matter with:
  - `title`: Post title
  - `date`: Publication date
  - `id`: Unique numeric identifier
- Posts registry in `content/posts/index.json` lists all post files

### Styling Approach
- Tailwind utility classes applied via JavaScript after markdown rendering
- Color scheme: 
  - Background: `bg-slate-50` (updated from gray-50)
  - Links: `text-blue-600` with `hover:text-blue-700`
  - Text: Gray palette for content
- Typography: 
  - Headings: `tracking-wide` for better spacing
  - Paragraphs: `leading-loose` for improved readability
- Interactive elements:
  - Post cards: `hover:scale-[1.02]` transform animation
  - Focus states: Ring styling for accessibility
  - Transitions: `duration-200` for smooth animations
- Container width: `max-w-3xl` (reduced from max-w-4xl)

## Hosting & Deployment
- **Domain**: www.wentongzhang.com (bare domain redirects to www)
- **Server**: Self-hosted on CentOS Stream 10 via Docker + Caddy 2
- **HTTPS**: Auto-provisioned by Caddy via Let's Encrypt
- **DNS**: Cloudflare (DNS-only mode, not proxied)
- **Auto-deploy**: Cron job checks every minute for new commits on main, pulls and rebuilds automatically
  - Enable: `just autodeploy-on`
  - Disable: `just autodeploy-off`
  - Check: `just autodeploy-status`

### Useful commands (via justfile)
- `just deploy` — build and start container
- `just redeploy` — rebuild after changes
- `just stop` — stop container
- `just logs` — view container logs
- `just status` — check container status
- `just serve` — local dev server (port 8080)

## Development Workflow
- No build process required
- Direct file editing
- Push to main to auto-deploy (within ~1 minute)
- Add new blog posts by:
  1. Creating markdown file in `content/posts/`
  2. Adding file path to `content/posts/index.json`
  3. Including proper front matter

## Testing
- Manual browser testing
- No automated test suite present

## Known Limitations
- No server-side rendering
- No build optimization (relies on CDN)
- Limited SEO optimization
- Basic blog functionality (no tags, categories, search)