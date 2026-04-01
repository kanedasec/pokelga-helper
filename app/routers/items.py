from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user
from typing import List

router = APIRouter(prefix="/me/items", tags=["items"])


@router.get("", response_model=List[schemas.ItemOut])
def list_items(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.ItemCard).filter(
        models.ItemCard.user_id == current_user.id
    ).all()


@router.post("", response_model=schemas.ItemOut, status_code=201)
def add_item(
    body: schemas.ItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = models.ItemCard(user_id=current_user.id, **body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.ItemCard).filter(
        models.ItemCard.id == item_id,
        models.ItemCard.user_id == current_user.id,
    ).first()
    if item is None:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()
