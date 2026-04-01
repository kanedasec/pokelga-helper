import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter
from app.database import engine, Base
from app import models  # noqa: F401 — ensures all models are registered
from app.routers import auth, players, state, pokemon, badges, items, events, vp, game_meta, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure data directory exists and create all tables
    os.makedirs("/app/data", exist_ok=True)
    Base.metadata.create_all(bind=engine)

    # Run schema migrations for columns added after initial deployment
    from sqlalchemy import text
    with engine.connect() as conn:
        for migration_sql in [
            "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE game_meta ADD COLUMN game_status TEXT NOT NULL DEFAULT 'setup'",
            "ALTER TABLE game_meta ADD COLUMN game_number INTEGER NOT NULL DEFAULT 1",
        ]:
            try:
                conn.execute(text(migration_sql))
                conn.commit()
            except Exception:
                pass  # column already exists


    from app.database import SessionLocal
    from app.auth import hash_password
    db = SessionLocal()
    try:
        # Ensure GameMeta singleton exists
        existing = db.query(models.GameMeta).filter(models.GameMeta.id == 1).first()
        if existing is None:
            db.add(models.GameMeta(id=1, game_status="setup", game_number=1))
            db.commit()

        # Seed master admin account (color='admin' sentinel, never a player slot)
        admin_password = os.environ.get("ADMIN_PASSWORD")
        if not admin_password:
            print("ERROR: ADMIN_PASSWORD environment variable is not set. Refusing to start.", file=sys.stderr)
            sys.exit(1)

        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        if admin_user is None:
            db.add(models.User(
                username="admin",
                hashed_password=hash_password(admin_password),
                color="admin",
                is_admin=True,
            ))
            db.commit()
        elif not admin_user.is_admin:
            admin_user.is_admin = True
            db.commit()
    finally:
        db.close()

    yield


app = FastAPI(
    title="Pokemon Let's Go Adventure Helper",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
api_prefix = "/api"
app.include_router(auth.router,       prefix=api_prefix)
app.include_router(players.router,    prefix=api_prefix)
app.include_router(state.router,      prefix=api_prefix)
app.include_router(pokemon.router,    prefix=api_prefix)
app.include_router(badges.router,     prefix=api_prefix)
app.include_router(items.router,      prefix=api_prefix)
app.include_router(events.router,     prefix=api_prefix)
app.include_router(vp.router,         prefix=api_prefix)
app.include_router(game_meta.router,  prefix=api_prefix)
app.include_router(admin.router,      prefix=api_prefix)

# Serve utils (rulebook, reminder cards, etc.)
utils_dir = os.path.join(os.path.dirname(__file__), "..", "utils")
app.mount("/utils", StaticFiles(directory=utils_dir), name="utils")

# Serve frontend — must come last
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
