from ..pyliveview import test as pyliveviewtest

snippet = r"""
a = 1
while a < 5:
    a
    print('Tick', a)
    a += 1


for t in range(5):
    t
    t
    t
"""


def test_loops(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
