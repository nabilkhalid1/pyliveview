from ..pyliveview import test as pyliveviewtest
import sys

snippet = r"""
class SomeClass():
    def __init__(self, num):
        num
        self.val = num
    def __repr__(self):
        self #?
        return str(self.val)
    def add(self, other):
        return SomeClass(self.val + other)

t = SomeClass(1) #?
t2 = t.add(2)
t2 #?
"""


def test_class(snapshot):
    res = pyliveviewtest(snippet)
    assert res == snapshot
