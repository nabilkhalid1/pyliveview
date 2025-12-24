from ..pyliveview import test as pyliveviewtest

snippet = r"""
a = 1
while a < 5:
    if a == 4:
        break
    if a == 3:
        pass
    a
    a += 1

for i in range(0, 5):
    if a == 1:
        continue
    i
"""


def test_keywords(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
