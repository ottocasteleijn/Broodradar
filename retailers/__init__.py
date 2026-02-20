RETAILERS = {
    "ah": {
        "name": "Albert Heijn",
        "color": "#00A0E2",
        "active": True,
        "description": "Grootste supermarktketen van Nederland",
        "icon": "/logos/ah.svg",
    },
    "jumbo": {
        "name": "Jumbo",
        "color": "#FFCC00",
        "active": True,
        "description": "De tweede supermarkt van Nederland",
        "icon": "/logos/jumbo.svg",
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
    raise ValueError(f"Onbekende retailer: {slug}")
