from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    color: str

    @field_validator("color")
    @classmethod
    def validate_color(cls, v):
        allowed = ["red", "green", "blue", "brown", "purple", "pink"]
        if v not in allowed:
            raise ValueError(f"Color must be one of {allowed}")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    color: Optional[str] = None
    username: str
    user_id: int
    is_admin: bool = False


class CreatePlayerRequest(BaseModel):
    username: str
    password: str
    color: str

    @field_validator("color")
    @classmethod
    def validate_color(cls, v):
        allowed = ["red", "green", "blue", "brown", "purple", "pink"]
        if v not in allowed:
            raise ValueError(f"Color must be one of {allowed}")
        return v


class GameResultOut(BaseModel):
    id: int
    game_number: int
    ended_at: datetime
    results: list

    model_config = {"from_attributes": True}


class GameStatusOut(BaseModel):
    game_status: str
    game_number: int
    player_count: int


# ── Player State ──────────────────────────────────────────────────────────────

class StateUpdate(BaseModel):
    pp: Optional[int] = None
    board_position: Optional[str] = None
    ko_tokens: Optional[int] = None
    tree_tokens: Optional[int] = None
    boulder_tokens: Optional[int] = None
    title_card_name: Optional[str] = None
    title_card_vp: Optional[int] = None
    notes: Optional[str] = None


class StateOut(BaseModel):
    pp: int
    board_position: str
    ko_tokens: int
    tree_tokens: int
    boulder_tokens: int
    title_card_name: Optional[str]
    title_card_vp: int
    notes: str

    model_config = {"from_attributes": True}


# ── Pokemon ───────────────────────────────────────────────────────────────────

class PokemonCreate(BaseModel):
    name: str
    deck_color: str = "green"
    printed_atk_pwr: int = 0
    level_up_counters: int = 0
    is_active: bool = False
    in_storage: bool = False
    slot_order: int = 0
    evolves_from_id: Optional[int] = None

    @field_validator("deck_color")
    @classmethod
    def validate_deck(cls, v):
        if v not in ("green", "blue", "red", "mega"):
            raise ValueError("deck_color must be green, blue, red, or mega")
        return v

    @field_validator("level_up_counters")
    @classmethod
    def validate_luc(cls, v):
        if not 0 <= v <= 5:
            raise ValueError("level_up_counters must be 0-5")
        return v


class PokemonUpdate(BaseModel):
    name: Optional[str] = None
    deck_color: Optional[str] = None
    printed_atk_pwr: Optional[int] = None
    level_up_counters: Optional[int] = None
    is_ko: Optional[bool] = None
    is_active: Optional[bool] = None
    in_storage: Optional[bool] = None
    slot_order: Optional[int] = None
    evolves_from_id: Optional[int] = None


class SetActiveRequest(BaseModel):
    pokemon_id: int


class PokemonOut(BaseModel):
    id: int
    name: str
    deck_color: str
    printed_atk_pwr: int
    level_up_counters: int
    is_ko: bool
    is_active: bool
    in_storage: bool
    slot_order: int
    evolves_from_id: Optional[int]

    model_config = {"from_attributes": True}


# ── Badges ────────────────────────────────────────────────────────────────────

class BadgeOut(BaseModel):
    id: int
    badge_name: str
    display_name: str
    gym_leader: str
    city: str
    earned: bool
    earned_at: Optional[datetime]

    model_config = {"from_attributes": True}


class BadgeToggle(BaseModel):
    earned: bool


# ── Item Cards (PRIVATE) ──────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    name: str
    card_type: str = "field"
    value: int = 0

    @field_validator("card_type")
    @classmethod
    def validate_type(cls, v):
        if v not in ("battle", "field", "poke_ball"):
            raise ValueError("card_type must be battle, field, or poke_ball")
        return v


class ItemOut(BaseModel):
    id: int
    name: str
    card_type: str
    value: int

    model_config = {"from_attributes": True}


# ── Event Cards ───────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    name: str
    effect_text: Optional[str] = None


class EventOut(BaseModel):
    id: int
    name: str
    effect_text: Optional[str]

    model_config = {"from_attributes": True}


# ── Game Meta ─────────────────────────────────────────────────────────────────

class GameMetaOut(BaseModel):
    saffron_gym_unlocked: bool
    viridian_gym_unlocked: bool
    victory_road_unlocked: bool
    game_ended: bool
    winner_color: Optional[str]

    model_config = {"from_attributes": True}


class GameMetaUpdate(BaseModel):
    saffron_gym_unlocked: Optional[bool] = None
    viridian_gym_unlocked: Optional[bool] = None
    victory_road_unlocked: Optional[bool] = None
    game_ended: Optional[bool] = None
    winner_color: Optional[str] = None


# ── Public Player View ────────────────────────────────────────────────────────

class PlayerPublicOut(BaseModel):
    user_id: int
    username: str
    color: str
    state: Optional[StateOut]
    pokemon: List[PokemonOut]
    badges: List[BadgeOut]
    events: List[EventOut]
    item_card_count: int


class PlayerPrivateOut(PlayerPublicOut):
    items: List[ItemOut]


# ── VP ────────────────────────────────────────────────────────────────────────

class VPBreakdown(BaseModel):
    team_atk_pwr_vp: int
    level_up_counter_vp: int
    storage_vp: int
    evolution_vp: int
    badge_vp: int
    title_card_vp: int
    cards_in_hand_vp: int
    tree_boulder_vp: int
    total_vp: int


class PlayerVPOut(BaseModel):
    color: str
    username: str
    breakdown: VPBreakdown
