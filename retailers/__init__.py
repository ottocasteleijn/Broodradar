RETAILERS = {
    "ah": {
        "name": "Albert Heijn",
        "color": "#00A0E2",
        "active": True,
        "description": "Grootste supermarktketen van Nederland",
    },
    "jumbo": {
        "name": "Jumbo",
        "color": "#FFCC00",
        "active": False,
        "description": "De tweede supermarkt van Nederland",
    },
    "lidl": {
        "name": "Lidl",
        "color": "#0050AA",
        "active": False,
        "description": "Duitse discounter",
    },
    "aldi": {
        "name": "Aldi",
        "color": "#FF6600",
        "active": False,
        "description": "Duitse discounter",
    },
    "plus": {
        "name": "Plus",
        "color": "#E30613",
        "active": False,
        "description": "Coöperatieve supermarkt",
    },
    "dirk": {
        "name": "Dirk",
        "color": "#ED1C24",
        "active": False,
        "description": "Dirk van den Broek",
    },
}


def get_fetcher(slug):
    """Importeer de fetch-module voor een retailer."""
    if slug == "ah":
        from retailers import ah
        return ah
    elif slug == "jumbo":
        from retailers import jumbo
        return jumbo
    elif slug == "lidl":
        from retailers import lidl
        return lidl
    elif slug == "aldi":
        from retailers import aldi
        return aldi
    elif slug == "plus":
        from retailers import plus
        return plus
    elif slug == "dirk":
        from retailers import dirk
        return dirk
    raise ValueError(f"Onbekende retailer: {slug}")
