import re


def truncate_words(text: str, max_words: int = 200) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).strip()


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def split_paragraphs(text: str, max_words: int = 80) -> list[str]:
    """Split text into TTS segments at paragraph / sentence boundaries."""
    cleaned = text.strip()
    if not cleaned:
        return []

    blocks = [b.strip() for b in re.split(r"\n\s*\n", cleaned) if b.strip()]
    if not blocks:
        blocks = [cleaned]

    segments: list[str] = []
    for block in blocks:
        words = block.split()
        if len(words) <= max_words:
            segments.append(block)
            continue
        sentences = re.split(r"(?<=[.!?])\s+", block)
        buf: list[str] = []
        buf_words = 0
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            sw = word_count(sentence)
            if buf_words + sw > max_words and buf:
                segments.append(" ".join(buf))
                buf = [sentence]
                buf_words = sw
            else:
                buf.append(sentence)
                buf_words += sw
        if buf:
            segments.append(" ".join(buf))

    return segments or [cleaned]
