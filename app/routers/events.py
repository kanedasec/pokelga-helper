from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user
from typing import List

router = APIRouter(prefix="/me/events", tags=["events"])


@router.get("", response_model=List[schemas.EventOut])
def list_events(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.EventCard).filter(
        models.EventCard.user_id == current_user.id
    ).all()


@router.post("", response_model=schemas.EventOut, status_code=201)
def add_event(
    body: schemas.EventCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    event = models.EventCard(user_id=current_user.id, **body.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    event = db.query(models.EventCard).filter(
        models.EventCard.id == event_id,
        models.EventCard.user_id == current_user.id,
    ).first()
    if event is None:
        raise HTTPException(404, "Event card not found")
    db.delete(event)
    db.commit()
