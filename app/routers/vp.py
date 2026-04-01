from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user
from app.config import PLAYER_COLORS
from typing import List

router = APIRouter(prefix="/vp", tags=["victory points"])

STORAGE_VP = {"green": 1, "blue": 2, "red": 3}


def _calc_vp(user: models.User) -> schemas.VPBreakdown:
    state = user.state
    all_pokemon = user.pokemon
    badges = user.badges

    # 1. Team AtkPwr VP (1 VP per printed AtkPwr point of team Pokemon)
    team_atk = sum(p.printed_atk_pwr for p in all_pokemon if not p.in_storage)

    # 2. Level Up Counter VP (all Pokemon, team + storage)
    luc_vp = sum(p.level_up_counters for p in all_pokemon)

    # 3. Storage VP
    storage_vp = sum(STORAGE_VP.get(p.deck_color, 0) for p in all_pokemon if p.in_storage)

    # 4. Evolution VP (2 VP per evolution link in the entire collection)
    evo_links = sum(1 for p in all_pokemon if p.evolves_from_id is not None)
    evo_vp = evo_links * 2

    # 5. Badge VP (5 VP each)
    badge_vp = sum(5 for b in badges if b.earned)

    # 6. Title card VP
    title_vp = state.title_card_vp if state else 0

    # 7. Cards in hand VP (items + keep events)
    cards_vp = len(user.items) + len(user.events)

    # 8. Tree + Boulder token VP (2 VP each)
    tb_vp = ((state.tree_tokens + state.boulder_tokens) * 2) if state else 0

    total = team_atk + luc_vp + storage_vp + evo_vp + badge_vp + title_vp + cards_vp + tb_vp

    return schemas.VPBreakdown(
        team_atk_pwr_vp=team_atk,
        level_up_counter_vp=luc_vp,
        storage_vp=storage_vp,
        evolution_vp=evo_vp,
        badge_vp=badge_vp,
        title_card_vp=title_vp,
        cards_in_hand_vp=cards_vp,
        tree_boulder_vp=tb_vp,
        total_vp=total,
    )


def _load_user_full(db: Session, color: str):
    return (
        db.query(models.User)
        .options(
            joinedload(models.User.state),
            joinedload(models.User.pokemon),
            joinedload(models.User.badges),
            joinedload(models.User.items),
            joinedload(models.User.events),
        )
        .filter(models.User.color == color)
        .first()
    )


@router.get("", response_model=List[schemas.PlayerVPOut])
def all_vp(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    result = []
    for color in PLAYER_COLORS:
        user = _load_user_full(db, color)
        if user:
            result.append(schemas.PlayerVPOut(
                color=user.color,
                username=user.username,
                breakdown=_calc_vp(user),
            ))
    return result


@router.get("/{color}", response_model=schemas.PlayerVPOut)
def player_vp(
    color: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from fastapi import HTTPException
    user = _load_user_full(db, color)
    if user is None:
        raise HTTPException(404, "Player not found")
    return schemas.PlayerVPOut(color=user.color, username=user.username, breakdown=_calc_vp(user))
