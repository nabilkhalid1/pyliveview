from ..pyliveview import test as pyliveviewtest

snippet = r"""
a = 'Hello'
b = 3

a
b
"""


def test_basic(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
