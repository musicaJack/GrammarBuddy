import logging
import random
import re
import xml.etree.ElementTree as ET

import httpx

from app.config import get_settings
from app.schemas.news import NewsArticle
from app.services.news_text import truncate_words

logger = logging.getLogger(__name__)

RSS_FEEDS = [
    ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("Reuters", "https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best"),
    ("NYT World", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"),
    ("China Daily", "https://www.chinadaily.com.cn/rss/world_rss.xml"),
]

FALLBACK_ARTICLES: list[NewsArticle] = [
    NewsArticle(
        title="Scientists discover a new species of butterfly in the Amazon",
        source="GrammarBuddy News",
        body=(
            "Researchers found a bright blue butterfly in the Amazon rainforest. "
            "The butterfly has wings that change color in sunlight. "
            "The team says the forest must be protected so animals like this can survive. "
            "Local schools will learn about the discovery this month."
        ),
    ),
    NewsArticle(
        title="City builds new library with a robot helper",
        source="GrammarBuddy News",
        body=(
            "A city in California opened a new children's library. "
            "A small robot greets kids and helps them find books. "
            "The mayor said reading is important for every child. "
            "More than two thousand students visited on the first day."
        ),
    ),
    NewsArticle(
        title="Students plant trees for Earth Day",
        source="GrammarBuddy News",
        body=(
            "Schools across the country planted trees for Earth Day. "
            "Children dug holes, planted saplings, and watered them. "
            "Teachers explained how trees clean the air. "
            "One class promised to visit their trees every month."
        ),
    ),
]


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _parse_rss(xml_text: str, source: str) -> list[NewsArticle]:
    articles: list[NewsArticle] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return articles

    for item in root.iter("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")
        title = (title_el.text or "").strip() if title_el is not None else ""
        if not title:
            continue
        body = _strip_html(desc_el.text or "") if desc_el is not None else title
        url = (link_el.text or "").strip() if link_el is not None else ""
        if len(body) < 40:
            body = title
        articles.append(
            NewsArticle(title=title, source=source, body=truncate_words(body, 100), url=url)
        )
    return articles


async def _fetch_from_newsapi() -> NewsArticle | None:
    settings = get_settings()
    if not settings.news_api_key:
        return None
    params = {
        "apiKey": settings.news_api_key,
        "pageSize": 20,
        "language": "en",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://newsapi.org/v2/top-headlines",
                params={**params, "category": random.choice(["general", "science", "technology"])},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            articles = data.get("articles") or []
            random.shuffle(articles)
            for raw in articles:
                title = (raw.get("title") or "").strip()
                body = _strip_html(raw.get("description") or raw.get("content") or "")
                if not title or len(body) < 30:
                    continue
                return NewsArticle(
                    title=title,
                    source=(raw.get("source") or {}).get("name") or "NewsAPI",
                    body=truncate_words(body, 100),
                    url=(raw.get("url") or "").strip(),
                )
    except Exception as exc:
        logger.warning("NewsAPI fetch failed: %s", exc)
    return None


async def _fetch_from_rss() -> NewsArticle | None:
    feeds = RSS_FEEDS.copy()
    random.shuffle(feeds)
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
        for source, url in feeds:
            try:
                resp = await client.get(url, headers={"User-Agent": "GrammarBuddy/1.0"})
                if resp.status_code != 200:
                    continue
                items = _parse_rss(resp.text, source)
                if items:
                    return random.choice(items[:15])
            except Exception as exc:
                logger.warning("RSS fetch failed for %s: %s", url, exc)
    return None


async def fetch_random_article() -> NewsArticle:
    article = await _fetch_from_newsapi()
    if article:
        return article
    article = await _fetch_from_rss()
    if article:
        return article
    return random.choice(FALLBACK_ARTICLES).model_copy()
