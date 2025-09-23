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
└── shared/            # Shared JavaScript utilities
    ├── nav.js        # Navigation component
    └── utils.js      # Markdown parsing and rendering utilities
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

## Development Workflow
- No build process required
- Direct file editing
- View changes by refreshing browser
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

## Recent Changes
Based on git history:
- Fixed navigation issues
- Large refactor for improved functionality
- Implemented hash routing (then reverted)
- Currently on `dev` branch