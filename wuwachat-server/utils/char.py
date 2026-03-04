from pathlib import Path


def load_characters(char_path: Path, resource_dir: Path, resource_url: str) -> list[dict]:
    """
    从 char.yaml 加载角色列表
    """
    import yaml
    
    if not char_path or not char_path.exists():
        return []

    with open(char_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not data or "characters" not in data:
        return []

    chars = []
    for char in data["characters"]:
        char_id = char.get("id", "")
        avatar_file = char.get("avatar", "")
        card_bg_file = char.get("card_bg", "")

        # 构建头像 URL
        if avatar_file and (resource_dir / avatar_file).exists():
            avatar_url = f"{resource_url}/{avatar_file}"

        # 构建卡片背景 URL
        card_bg_url = ""
        if card_bg_file and (resource_dir / card_bg_file).exists():
            card_bg_url = f"{resource_url}/{card_bg_file}"

        chars.append({
            "id": char_id,
            "name": char.get("name", char_id),
            "prompt_file": char.get("prompt_file", ""),
            "avatar": avatar_url,
            "card_bg": card_bg_url,
        })

    return chars