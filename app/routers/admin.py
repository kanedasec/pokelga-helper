import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import models, schemas, auth as auth_utils
from app.deps import get_admin_user
from app.routers.badges import _evaluate_gym_unlocks
from app.routers.auth import _seed_player
from app.config import PLAYER_COLORS, BADGES

router = APIRouter(prefix="/admin", tags=["admin"])


def _load_user(db: Session, user_id: int) -> models.User:
    user = (
        db.query(models.User)
        .options(
            joinedload(models.User.state),
            joinedload(models.User.pokemon),
            joinedload(models.User.badges),
            joinedload(models.User.items),
            joinedload(models.User.events),
        )
        .filter(models.User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(404, "Player not found")
    return user


# ── Full private data ─────────────────────────────────────────────────────────

@router.get("/players/{user_id}")
def get_player(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    user = _load_user(db, user_id)
    return {
        "user_id": user.id,
        "username": user.username,
        "color": user.color,
        "is_admin": user.is_admin,
        "state": schemas.StateOut.model_validate(user.state).model_dump() if user.state else None,
        "pokemon": [schemas.PokemonOut.model_validate(p).model_dump() for p in user.pokemon],
        "badges": [schemas.BadgeOut.model_validate(b).model_dump() for b in user.badges],
        "events": [schemas.EventOut.model_validate(e).model_dump() for e in user.events],
        "items": [schemas.ItemOut.model_validate(i).model_dump() for i in user.items],
        "item_card_count": len(user.items),
    }


# ── Delete player ─────────────────────────────────────────────────────────────

@router.delete("/players/{user_id}", status_code=204)
def delete_player(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    if user_id == admin.id:
        raise HTTPException(400, "Admin cannot delete themselves")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(404, "Player not found")
    db.delete(user)
    db.commit()


# ── State ─────────────────────────────────────────────────────────────────────

@router.patch("/players/{user_id}/state", response_model=schemas.StateOut)
def update_state(
    user_id: int,
    body: schemas.StateUpdate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    user = _load_user(db, user_id)
    state = user.state
    if state is None:
        raise HTTPException(404, "Player state not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(state, field, value)
    db.commit()
    db.refresh(state)
    return state


# ── Pokemon ───────────────────────────────────────────────────────────────────

@router.post("/players/{user_id}/pokemon", response_model=schemas.PokemonOut, status_code=201)
def add_pokemon(
    user_id: int,
    body: schemas.PokemonCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    _load_user(db, user_id)
    pk = models.Pokemon(user_id=user_id, **body.model_dump())
    db.add(pk)
    db.commit()
    db.refresh(pk)
    return pk


@router.patch("/players/{user_id}/pokemon/active", response_model=schemas.PokemonOut)
def set_active(
    user_id: int,
    body: schemas.SetActiveRequest,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    db.query(models.Pokemon).filter(
        models.Pokemon.user_id == user_id
    ).update({"is_active": False})
    pk = db.query(models.Pokemon).filter(
        models.Pokemon.id == body.pokemon_id,
        models.Pokemon.user_id == user_id,
    ).first()
    if pk is None:
        raise HTTPException(404, "Pokemon not found")
    if pk.is_ko:
        raise HTTPException(400, "Cannot set KO'd Pokemon as active")
    pk.is_active = True
    db.commit()
    db.refresh(pk)
    return pk


@router.patch("/players/{user_id}/pokemon/{pk_id}", response_model=schemas.PokemonOut)
def update_pokemon(
    user_id: int,
    pk_id: int,
    body: schemas.PokemonUpdate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    pk = db.query(models.Pokemon).filter(
        models.Pokemon.id == pk_id,
        models.Pokemon.user_id == user_id,
    ).first()
    if pk is None:
        raise HTTPException(404, "Pokemon not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(pk, field, value)
    db.commit()
    db.refresh(pk)
    return pk


@router.delete("/players/{user_id}/pokemon/{pk_id}", status_code=204)
def delete_pokemon(
    user_id: int,
    pk_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    pk = db.query(models.Pokemon).filter(
        models.Pokemon.id == pk_id,
        models.Pokemon.user_id == user_id,
    ).first()
    if pk is None:
        raise HTTPException(404, "Pokemon not found")
    db.delete(pk)
    db.commit()


# ── Badges ────────────────────────────────────────────────────────────────────

@router.patch("/players/{user_id}/badges/{badge_name}", response_model=schemas.BadgeOut)
def toggle_badge(
    user_id: int,
    badge_name: str,
    body: schemas.BadgeToggle,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    badge = db.query(models.Badge).filter(
        models.Badge.user_id == user_id,
        models.Badge.badge_name == badge_name,
    ).first()
    if badge is None:
        raise HTTPException(404, "Badge not found")
    badge.earned = body.earned
    badge.earned_at = datetime.now(timezone.utc) if body.earned else None
    db.flush()
    _evaluate_gym_unlocks(db)
    db.commit()
    db.refresh(badge)
    return badge


# ── Items ─────────────────────────────────────────────────────────────────────

@router.post("/players/{user_id}/items", response_model=schemas.ItemOut, status_code=201)
def add_item(
    user_id: int,
    body: schemas.ItemCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    _load_user(db, user_id)
    item = models.ItemCard(user_id=user_id, **body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/players/{user_id}/items/{item_id}", status_code=204)
def delete_item(
    user_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    item = db.query(models.ItemCard).filter(
        models.ItemCard.id == item_id,
        models.ItemCard.user_id == user_id,
    ).first()
    if item is None:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()


# ── Events ────────────────────────────────────────────────────────────────────

@router.post("/players/{user_id}/events", response_model=schemas.EventOut, status_code=201)
def add_event(
    user_id: int,
    body: schemas.EventCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    _load_user(db, user_id)
    ev = models.EventCard(user_id=user_id, **body.model_dump())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/players/{user_id}/events/{event_id}", status_code=204)
def delete_event(
    user_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    ev = db.query(models.EventCard).filter(
        models.EventCard.id == event_id,
        models.EventCard.user_id == user_id,
    ).first()
    if ev is None:
        raise HTTPException(404, "Event not found")
    db.delete(ev)
    db.commit()


# ── Game Management ───────────────────────────────────────────────────────────

def _game_meta(db: Session) -> models.GameMeta:
    return db.query(models.GameMeta).filter(models.GameMeta.id == 1).first()


def _snapshot_results(db: Session, game: models.GameMeta):
    """Save current VP standings as a GameResult row."""
    from app.routers.vp import _calc_vp, _load_user_full
    players = []
    for color in PLAYER_COLORS:
        user = _load_user_full(db, color)
        if user:
            vp = _calc_vp(user)
            players.append({
                "username": user.username,
                "color": user.color,
                "total_vp": vp.total_vp,
                "badges": sum(1 for b in user.badges if b.earned),
                "pokemon": len(user.pokemon),
            })
    players.sort(key=lambda p: p["total_vp"], reverse=True)
    result = models.GameResult(
        game_number=game.game_number,
        results_json=json.dumps(players),
    )
    db.add(result)


def _reset_game_meta(db: Session, game: models.GameMeta, new_number: int):
    game.saffron_gym_unlocked = False
    game.viridian_gym_unlocked = False
    game.victory_road_unlocked = False
    game.game_ended = False
    game.winner_color = None
    game.game_status = "setup"
    game.game_number = new_number


@router.get("/game/status")
def game_status(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    game = _game_meta(db)
    player_count = db.query(models.User).filter(models.User.color != "admin").count()
    return {"game_status": game.game_status, "game_number": game.game_number, "player_count": player_count}


@router.post("/game/new", status_code=200)
def new_game(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Archive current game (if active/ended) then wipe all players for a fresh start."""
    game = _game_meta(db)
    if game.game_status == "active":
        _snapshot_results(db, game)
    # Delete all non-admin users (cascades everything)
    db.query(models.User).filter(models.User.color != "admin").delete()
    _reset_game_meta(db, game, game.game_number + 1)
    db.commit()
    return {"message": "New game created", "game_number": game.game_number}


@router.post("/game/start", status_code=200)
def start_game(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Move game from setup to active."""
    game = _game_meta(db)
    if game.game_status != "setup":
        raise HTTPException(400, "Game is not in setup phase")
    player_count = db.query(models.User).filter(models.User.color.isnot(None)).count()
    if player_count == 0:
        raise HTTPException(400, "Add at least one player before starting")
    game.game_status = "active"
    db.commit()
    return {"message": "Game started", "game_number": game.game_number}


@router.post("/game/end", status_code=200)
def end_game(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """End current game and save results."""
    game = _game_meta(db)
    if game.game_status == "ended":
        raise HTTPException(400, "Game already ended")
    _snapshot_results(db, game)
    game.game_status = "ended"
    game.game_ended = True
    db.commit()
    return {"message": "Game ended and results saved"}


@router.post("/game/restart", status_code=200)
def restart_game(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Save results, wipe all player data, keep player accounts, restart fresh."""
    game = _game_meta(db)
    if game.game_status == "active":
        _snapshot_results(db, game)
    # Wipe all player data but keep User accounts
    players = db.query(models.User).filter(models.User.color.isnot(None)).all()
    for user in players:
        db.query(models.Pokemon).filter(models.Pokemon.user_id == user.id).delete()
        db.query(models.ItemCard).filter(models.ItemCard.user_id == user.id).delete()
        db.query(models.EventCard).filter(models.EventCard.user_id == user.id).delete()
        db.query(models.Badge).filter(models.Badge.user_id == user.id).delete()
        db.query(models.PlayerState).filter(models.PlayerState.user_id == user.id).delete()
        # Re-seed state and badges
        _seed_player(db, user)
    _reset_game_meta(db, game, game.game_number + 1)
    game.game_status = "active"
    db.commit()
    return {"message": "Game restarted", "game_number": game.game_number}


@router.get("/game/results")
def get_results(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    results = db.query(models.GameResult).order_by(models.GameResult.game_number.desc()).all()
    return [
        {
            "id": r.id,
            "game_number": r.game_number,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "players": json.loads(r.results_json),
        }
        for r in results
    ]


@router.post("/players/create", response_model=schemas.TokenResponse, status_code=201)
def create_player(
    body: schemas.CreatePlayerRequest,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Admin creates a player account for the current game."""
    game = _game_meta(db)
    if game.game_status == "ended":
        raise HTTPException(400, "Cannot add players to an ended game. Start a new game first.")

    player_count = db.query(models.User).filter(models.User.color != "admin").count()
    if player_count >= len(PLAYER_COLORS):
        raise HTTPException(400, f"Maximum {len(PLAYER_COLORS)} players reached")

    if db.query(models.User).filter(models.User.color == body.color).first():
        raise HTTPException(409, "Color slot already taken")
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(409, "Username already taken")

    user = models.User(
        username=body.username,
        hashed_password=auth_utils.hash_password(body.password),
        color=body.color,
        is_admin=False,
    )
    db.add(user)
    db.flush()
    _seed_player(db, user)
    db.commit()
    db.refresh(user)

    token = auth_utils.create_access_token(user.id, user.color, user.username, user.is_admin)
    return schemas.TokenResponse(
        access_token=token, color=user.color,
        username=user.username, user_id=user.id, is_admin=False
    )
