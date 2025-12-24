from ..pyliveview import test as pyliveviewtest

snippet = r"""
0/0

print('nope')
"""


def test_division_by_zero(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
