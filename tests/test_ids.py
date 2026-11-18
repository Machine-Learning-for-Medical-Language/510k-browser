import pytest

from fda510k.ids import NodeType, node_type, normalize_id, shard_key


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("K123456", "K123456"),
        (" k123456\n", "K123456"),
        ("K#123456", "K123456"),
        ("K 123456", "K123456"),
        ("DEN200012", "DEN200012"),
        ("P970003/S012", "P970003"),
        ("K12345", None),
        ("K1234567", None),
        ("S", None),
        ("", None),
    ],
)
def test_normalize_id(raw: str, expected: str | None) -> None:
    assert normalize_id(raw) == expected


@pytest.mark.parametrize(
    ("id_", "type_", "shard"),
    [
        ("K231234", NodeType.K510, "K23"),
        ("K991234", NodeType.K510, "K99"),
        ("DEN200012", NodeType.DENOVO, "DEN"),
        ("P970003", NodeType.PMA, "P"),
    ],
)
def test_node_type_and_shard(id_: str, type_: NodeType, shard: str) -> None:
    assert node_type(id_) is type_
    assert shard_key(id_) == shard


def test_shard_key_rejects_unknown() -> None:
    assert node_type("X1") is NodeType.UNKNOWN
    with pytest.raises(ValueError, match="not a recognized identifier"):
        shard_key("X1")
