from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user
from typing import List

router = APIRouter(prefix="/me/pokemon", tags=["pokemon"])


def _owned(db: Session, pokemon_id: int, user_id: int) -> models.Pokemon:
    p = db.query(models.Pokemon).filter(
        models.Pokemon.id == pokemon_id,
        models.Pokemon.user_id == user_id
    ).first()
    if p is None:
        raise HTTPException(404, "Pokemon not found")
    return p


@router.get("", response_model=List[schemas.PokemonOut])
def list_pokemon(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Pokemon).filter(
        models.Pokemon.user_id == current_user.id
    ).order_by(models.Pokemon.slot_order).all()


@router.post("", response_model=schemas.PokemonOut, status_code=201)
def add_pokemon(
    body: schemas.PokemonCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Team limit check (max 6 on team)
    if not body.in_storage:
        team_count = db.query(models.Pokemon).filter(
            models.Pokemon.user_id == current_user.id,
            models.Pokemon.in_storage == False
        ).count()
        if team_count >= 6:
            raise HTTPException(400, "Team is full (max 6). Send to storage.")

    # Validate evolves_from_id belongs to same user
    if body.evolves_from_id is not None:
        base = db.query(models.Pokemon).filter(
            models.Pokemon.id == body.evolves_from_id,
            models.Pokemon.user_id == current_user.id
        ).first()
        if base is None:
            raise HTTPException(400, "evolves_from_id not found in your collection")

    # If setting as active, clear others
    if body.is_active:
        db.query(models.Pokemon).filter(
            models.Pokemon.user_id == current_user.id
        ).update({"is_active": False})

    p = models.Pokemon(user_id=current_user.id, **body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.patch("/active", response_model=schemas.PokemonOut)
def set_active(
    body: schemas.SetActiveRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    target = _owned(db, body.pokemon_id, current_user.id)
    if target.is_ko:
        raise HTTPException(400, "Cannot set a KO'd Pokemon as active")

    db.query(models.Pokemon).filter(
        models.Pokemon.user_id == current_user.id
    ).update({"is_active": False})
    target.is_active = True
    db.commit()
    db.refresh(target)
    return target


@router.patch("/{pokemon_id}", response_model=schemas.PokemonOut)
def update_pokemon(
    pokemon_id: int,
    body: schemas.PokemonUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    p = _owned(db, pokemon_id, current_user.id)
    updates = body.model_dump(exclude_none=True)

    if "level_up_counters" in updates:
        updates["level_up_counters"] = max(0, min(5, updates["level_up_counters"]))

    # If moving to team, check limit
    if updates.get("in_storage") is False and p.in_storage:
        team_count = db.query(models.Pokemon).filter(
            models.Pokemon.user_id == current_user.id,
            models.Pokemon.in_storage == False,
            models.Pokemon.id != pokemon_id
        ).count()
        if team_count >= 6:
            raise HTTPException(400, "Team is full (max 6)")

    # Prevent setting KO'd as active
    if updates.get("is_active") and (updates.get("is_ko", p.is_ko)):
        raise HTTPException(400, "Cannot set a KO'd Pokemon as active")

    # If setting as active, clear others
    if updates.get("is_active"):
        db.query(models.Pokemon).filter(
            models.Pokemon.user_id == current_user.id
        ).update({"is_active": False})

    for field, value in updates.items():
        setattr(p, field, value)

    db.commit()
    db.refresh(p)
    return p


@router.delete("/{pokemon_id}", status_code=204)
def delete_pokemon(
    pokemon_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    p = _owned(db, pokemon_id, current_user.id)
    db.delete(p)
    db.commit()
