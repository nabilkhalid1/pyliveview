from ..pyliveview import test as pyliveviewtest
import sys

snippet1 = r"""
1 + 334  # ?  BROKEN

1 < 0
"""
snippet2 = r"""
1 + 334  # ?  WORKS
"""

import json


def test_bug_1():
    res1 = json.loads(pyliveviewtest(snippet1))
    res2 = json.loads(pyliveviewtest(snippet2))

    assert len(res1) > 0
    assert len(res2) > 0

    # Compare values only, ignoring metadata like source and lineno
    v1 = [i["value"] for i in res1]
    v2 = [i["value"] for i in res2]

    assert v1 == v2
