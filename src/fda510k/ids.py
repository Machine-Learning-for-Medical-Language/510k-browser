"""FDA submission identifiers: 510(k) (K), De Novo (DEN) and PMA (P) numbers."""

import re
from enum import StrEnum

K_NUMBER = re.compile(r"^K\d{6}$")
DEN_NUMBER = re.compile(r"^DEN\d{6}$")
PMA_NUMBER = re.compile(r"^P\d{6}$")


class NodeType(StrEnum):
    K510 = "510k"
    DENOVO = "denovo"
    PMA = "pma"
    UNKNOWN = "unknown"


def normalize_id(raw: str) -> str | None:
    """Uppercase, strip whitespace and `#`; return None if not a recognized identifier.

    PMA supplements (P123456/S001) collapse to the base PMA number.
    """
    s = re.sub(r"[\s#]", "", raw).upper()
    s = s.split("/", 1)[0]
    if K_NUMBER.match(s) or DEN_NUMBER.match(s) or PMA_NUMBER.match(s):
        return s
    return None


def node_type(id_: str) -> NodeType:
    if K_NUMBER.match(id_):
        return NodeType.K510
    if DEN_NUMBER.match(id_):
        return NodeType.DENOVO
    if PMA_NUMBER.match(id_):
        return NodeType.PMA
    return NodeType.UNKNOWN


def shard_key(id_: str) -> str:
    """Bucket used to shard per-node files: `K23`, `K99`, `DEN`, `P`.

    K-numbers shard by their two-digit fiscal-year prefix, giving ~3k devices per shard.
    """
    if K_NUMBER.match(id_):
        return id_[:3]
    if DEN_NUMBER.match(id_):
        return "DEN"
    if PMA_NUMBER.match(id_):
        return "P"
    raise ValueError(f"not a recognized identifier: {id_!r}")
