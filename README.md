# PokeLGA Helper - Let's get them all!

A session tracker for **Pokemon Let's Go Adventure** — a tabletop board game played with physical cards and dice. Tracks each player's Pokemon team, items, badges, board position, and Victory Points in real time.

The original game mod was built for 4 players, but i made this app to support a group of up to 6 players. The admin account manages the game session; players log in to manage their own boards.

---

## Features

- **Dashboard** — live overview of all players: team, badges, PP bar, board position, events, notes
- **Board view** — interactive map with draggable player tokens and auto-detection of board areas
- **Card viewer** — browse all decks (Green, Blue, Red, Mega, Legendary, Item, Event) with card images
- **Victory Points** — live VP table with full breakdown per player
- **Admin panel** — create/manage players, start/end/restart games, view past game results
- **Auto-refresh** — dashboard polls every 15 seconds

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Auth | JWT (python-jose) + bcrypt |
| Frontend | Vanilla JS, no framework |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions → SSH → EC2 |

---

## Running locally

```bash
# Copy and fill in your admin password
cp docker-compose.yml docker-compose.yml   # already has dev defaults

docker compose up --build
```

App available at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

Default dev credentials (set in `docker-compose.yml`):
- Username: `admin`
- Password: set by `ADMIN_PASSWORD` env var (default is Pasword123)

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing secret — use a random 32+ char string in production |
| `ADMIN_PASSWORD` | Yes | Password for the `admin` account — app refuses to start without it |
| `DATABASE_URL` | No | SQLite path (default: `sqlite:////app/data/game.db`) |
| `ENVIRONMENT` | No | `development` or `production` |

---

## Project structure

```
├── app/
│   ├── main.py          # FastAPI app, startup migrations, admin seeding
│   ├── models.py        # SQLAlchemy models
│   ├── schemas.py       # Pydantic schemas
│   ├── auth.py          # JWT + bcrypt helpers
│   ├── deps.py          # get_current_user, get_admin_user dependencies
│   ├── limiter.py       # Rate limiter (slowapi)
│   └── routers/
│       ├── auth.py      # Login
│       ├── players.py   # Public/private player views
│       ├── admin.py     # Admin: player management, game lifecycle
│       ├── pokemon.py   # Pokemon CRUD
│       ├── items.py     # Item cards
│       ├── events.py    # Event cards
│       ├── badges.py    # Badge toggles
│       ├── state.py     # Board state (PP, position, tokens, notes)
│       ├── game_meta.py # Game-wide flags (gyms, winner)
│       └── vp.py        # Victory point calculation
├── static/
│   ├── index.html
│   ├── app.js           # Single-file frontend app
│   ├── style.css
│   ├── board.png        # Game board image
│   ├── cards.json       # Card definitions for all decks
│   └── card-images/     # Extracted card art (green/blue/red/mega/legendary/item/event)
├── .github/
│   └── workflows/
│       └── deploy.yml   # Auto-deploy to EC2 on push to main
├── Dockerfile
├── docker-compose.yml        # Local dev
└── docker-compose.prod.yml   # Production (reads from .env.prod on server)
```

---

## Game lifecycle

```
setup  →  active  →  ended
  ↑                     |
  └─────────────────────┘  (restart resets player data, increments game number)
```

- **setup**: admin creates player accounts, players can log in but game isn't running
- **active**: game in progress, all features enabled
- **ended**: game over, results snapshot saved, visible in admin panel

---

## Deployment

Automated via GitHub Actions on push to `main`. See `DEPLOY.md` for full AWS EC2 setup instructions (excluded from git — infrastructure details stay local).

Two GitHub secrets are required: `EC2_HOST` and `EC2_SSH_KEY`.

---

