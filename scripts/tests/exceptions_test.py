from ..pyliveview import test as pyliveviewtest


snippet1 = r"""
raise Exception('hi')
"""


def test_exception(snapshot):
    res = pyliveviewtest(snippet1)
    assert res == snapshot


snippet2 = r"""
raise BaseException('hi')
"""


def test_base_exception(snapshot):
    res = pyliveviewtest(snippet2)
    assert res == snapshot
