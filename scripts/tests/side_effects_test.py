from ..pyliveview import test as pyliveviewtest

snippet = r"""
b = [*range(1, 4)]  # ?  <-- Comment Macro ~ Result ->

print('before', b)
b.pop()  # ?
print('after', b)

b  # ?
b
"""


def test_side_effects(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
