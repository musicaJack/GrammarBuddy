import re


def normalize_sentence(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s']", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def repeat_matches(user_text: str, target_sentence: str) -> bool:
    user = normalize_sentence(user_text)
    target = normalize_sentence(target_sentence)
    if not user or not target:
        return False
    if user == target:
        return True
    if target in user or user in target:
        return True

    user_words = user.split()
    target_words = target.split()
    if not target_words:
        return False

    if len(user_words) == len(target_words):
        matches = sum(1 for u, t in zip(user_words, target_words) if u == t)
        if matches / len(target_words) >= 0.85:
            return True

    target_set = set(target_words)
    overlap = len(set(user_words) & target_set) / len(target_set)
    return overlap >= 0.85
