from ..pyliveview import test as pyliveviewtest
from sys import platform

snippet = """
unicode_text = 'é'  # ?

unicode_text

print("🍆") #?
"""


def test_unicode(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
