import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "pokemon-lets-go-adventure-change-in-production"
    algorithm: str = "HS256"
    jwt_expire_days: int = 7
    database_url: str = "sqlite:////app/data/game.db"
    environment: str = "production"

    class Config:
        env_file = ".env"


settings = Settings()

PLAYER_COLORS = ["red", "green", "blue", "brown", "purple", "pink"]

COLOR_HEX = {
    "red":    "#e53935",
    "green":  "#43a047",
    "blue":   "#1e88e5",
    "brown":  "#795548",
    "purple": "#8e24aa",
    "pink":   "#e91e8c",
}

BADGES = [
    {"name": "boulder", "display": "Boulder Badge", "gym_leader": "Brock",     "city": "Pewter City"},
    {"name": "cascade", "display": "Cascade Badge", "gym_leader": "Misty",     "city": "Cerulean City"},
    {"name": "thunder", "display": "Thunder Badge", "gym_leader": "Lt. Surge", "city": "Vermilion City"},
    {"name": "rainbow", "display": "Rainbow Badge", "gym_leader": "Erika",     "city": "Celadon City"},
    {"name": "soul",    "display": "Soul Badge",    "gym_leader": "Koga",      "city": "Fuchsia City"},
    {"name": "marsh",   "display": "Marsh Badge",   "gym_leader": "Sabrina",   "city": "Saffron City"},
    {"name": "volcano", "display": "Volcano Badge", "gym_leader": "Blaine",    "city": "Cinnabar Island"},
    {"name": "earth",   "display": "Earth Badge",   "gym_leader": "Giovanni",  "city": "Viridian City"},
]

BOARD_POSITIONS = [
    "Pallet Town",
    "Route 1",
    "Viridian City",
    "Route 2 (South)",
    "Viridian Forest",
    "Route 2 (North)",
    "Pewter City",
    "Route 3",
    "Mt. Moon (West)",
    "Mt. Moon (East)",
    "Route 4",
    "Cerulean City",
    "Route 25 (Nugget Bridge)",
    "Route 5",
    "Route 6",
    "Vermilion City",
    "Route 11",
    "Route 12",
    "Route 13",
    "Route 14",
    "Route 15",
    "Fuchsia City",
    "Route 19 (Water)",
    "Route 20 (Water)",
    "Cinnabar Island",
    "Route 21 (Water)",
    "Route 8",
    "Route 7",
    "Celadon City",
    "Route 16",
    "Route 17 (Cycling Road)",
    "Route 18",
    "Saffron City",
    "Route 9",
    "Rock Tunnel",
    "Route 10",
    "Lavender Town",
    "Viridian City (Gym Open)",
    "Victory Road",
    "Indigo Plateau",
]
