from ..pyliveview import test as pyliveviewtest

snippet = r"""
# data types
tup = (1, 2, 3)  # ?
tup

1 < 0  # ?

text = 'happy'  # ?

text

# newline characters in strings
x = "foo\nfaa"  # ?

a=1 #?
"""


def test_etc(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
