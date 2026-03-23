# Kangaroo Math 袋鼠数学

An online practice platform for the **Mathematical Kangaroo** competition, covering all 6 levels (A–F) with past papers from 2013–2025.

## Features

- **Multi-level support**: Level A through Level F, covering all age groups
- **Historical papers**: Past competition papers from 2013 to 2025
- **Quiz mode**: Timed practice with automatic scoring
- **Score history & wrong answer review**: Track progress and revisit mistakes
- **Invite-based access**: Auth-protected with invite code registration
- **Admin panel**: Manage users and invite codes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Hosting | Cloudflare Pages |
| Backend | Cloudflare Pages Functions (TypeScript) |
| Database | Cloudflare D1 (SQLite) |
| Frontend | Vanilla HTML/CSS/JavaScript |

## Project Structure

```
├── public/              # Static frontend files
│   ├── index.html       # Home page (level selection)
│   ├── quiz.html        # Quiz interface
│   ├── papers.html      # Paper browser
│   ├── login.html       # Login page
│   ├── admin.html       # Admin panel
│   ├── level-a ~ f/     # Level-specific paper data
│   ├── data/            # Question data (Level B)
│   └── 2013~2025/       # Year-based paper data (Level B/C)
├── functions/api/       # Cloudflare Pages Functions
│   ├── auth/            # Login & registration
│   ├── quiz/            # Quiz submission & scoring
│   ├── admin/           # Admin APIs
│   └── invite/          # Invite code management
├── src/                 # Shared TypeScript modules
│   ├── auth.ts          # Auth utilities
│   └── db/              # Database schema & migrations
├── wrangler.toml        # Cloudflare config
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npx wrangler pages dev public

# Deploy
npx wrangler pages deploy public
```

## License

ISC
