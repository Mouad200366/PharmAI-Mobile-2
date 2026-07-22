import secrets


def generate_code(length: int = 6) -> str:
    upper = 10 ** length
    return f'{secrets.randbelow(upper):0{length}d}'
