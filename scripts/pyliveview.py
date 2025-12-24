r"""PyLiveView - Tracer module for live variable inspection in Python code.

Originally created as "Wolf" by Scott Doucet.
Adapted and renamed to PyLiveView for VS Code extension.

Copyright 2025 Nabil Khalid

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import ast
import os
import sys
import re
import json
import builtins
import traceback
import io
from copy import deepcopy
from importlib import util
from contextlib import contextmanager

try:
    from ast import unparse
except ImportError:
    try:
        from astunparse import unparse
    except ImportError:
        # Check if we are in the scripts directory or have it in path
        from .astunparse import unparse

try:
    import hunter
    from hunter import trace
except ImportError as e:
    # If hunter is not available, exit gracefully with an error
    print("PLV: []", file=sys.stdout)
    print(f"Error importing hunter: {e}", file=sys.stderr)
    sys.exit(1)


###################
#
# Utilities, helper functions, regex ..

# This is to help us find lines tagged with a PyLiveView macro.
# If the line has a print statement, then we want the expression being printed,
# if it's a single variable, we want that. Etc..
#
# NOTE: See https://regex101.com/r/sf6nAH/15 for more info
PLV_MACROS = re.compile(
    r"^(?!pass\b|from\b|import\b|return\b|continue\b|if\b|for\b)((?P<variable>\w+)$|^(?P<print>print\(.+\))|^(?P<macro_source>(?P<local>[^\d\W]+\s)*((?P<assignment>\=)?(?P<operator>\+\=|\-\=|\*\=|\\\=)* *)*(?P<macro>[\w\{\[\(\'\"].+)\#\s?\?[^\n]*))"
)


def import_file(full_name, fullpath):
    """
    The recommended method of importing a file by its
    absolute path in Python 3.5+
    """
    spec = util.spec_from_file_location(full_name, fullpath)
    mod = util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@contextmanager
def script_path(script_dir):
    """
    Context manager for adding a dir to the sys path
    and restoring it afterwards. This trick allows
    relative imports to work on the target script.
    """
    original_cwd = os.getcwd()
    os.chdir(script_dir)
    sys.path.insert(1, script_dir)
    yield
    os.chdir(original_cwd)
    sys.path.remove(script_dir)


def try_deepcopy(obj):
    """
    Deepcopy can throw a type error when sys modules are to be
    included in the object being copied.. It can also throw an
    AttributeError in python 3.5 for some reason..
    """
    try:
        return deepcopy(obj)
    except (TypeError, AttributeError):
        return obj


def contains_any(*args):
    return any(i in args[-1] for i in args[:-1])


###################
#
# PyLiveView Internal API
#

# -% Globals %-
#
# PLV[dict]: Results from each line trace
PLV = []
COUNTER = 1
ORIGINAL_PRINT = builtins.print

# Sentinel used to signal an eval error without throwing from the tracer.
EVAL_ERROR = object()


def hooked_print(*args, **kwargs):
    # Capture output to a string
    f = io.StringIO()
    # We must be careful not to trigger recursion if kwargs contains 'file'
    # that is already wrapped, but here we just use our own StringIO.
    ORIGINAL_PRINT(*args, **kwargs, file=f)
    captured = f.getvalue().strip()

    # Forward to real stdout/file as intended
    ORIGINAL_PRINT(*args, **kwargs)

    if not captured:
        return

    # Get caller's line number
    try:
        frame = sys._getframe(1)
        lineno = frame.f_lineno
    except:
        return

    global PLV
    # Find active tracing entries for this line and update them
    # We search from the end of PLV because print happens after the line is hit.
    for item in reversed(PLV):
        if item["lineno"] == lineno:
            current = item.get("value", "").strip()
            if current and current != "None":
                item["value"] = f"{current}\n{captured}".strip()
            else:
                item["value"] = captured
            break


def resultifier(value):
    # Here we can set the string representation
    # of the result. For example, callables are
    # simply converted to their string repr. None
    # is converted to "None". And anything else
    # is pretty formatted to a string.
    if isinstance(value, bool):
        return str(value)
    if callable(value):
        return repr(value)
    if value is None:
        return "None"
    return str(value)


def plv_formats():
    # It's important that we create an output that can be handled
    # by the javascript `JSON.parse(...)` function.
    results = [json.dumps(i) for i in PLV if contains_any("value", "error", i.keys())]
    python_data = ", ".join(results)

    return "[" + python_data + "]"


def plv_prints():
    # DO NOT TOUCH, ie: no pretty printing
    print("PYLIVEVIEW_PYTHON_EXECUTABLE: " + sys.executable)
    print("PLV: " + plv_formats())  # <--  PyLiveView result
    ######################################


class StopTracer(BaseException):
    """Used to stop the hunter tracer without exiting the process."""

    pass


def parse_eval(*args, **kw):
    global PLV
    event = kw.get("event")

    try:
        return eval(*args)
    except BaseException as e:
        if event and event.kind == "line":
            thrown = traceback.format_exception_only(type(e), e)
            source = event["source"].strip()
            metadata = {
                "lineno": event["lineno"],
                "source": source,
                "value": thrown[0].strip(),
                "error": True,
            }

            # Newer tracer behavior can surface the same line error more than once.
            # Keep output stable by avoiding consecutive duplicates.
            if not (PLV and PLV[-1].get("error") is True and PLV[-1] == metadata):
                PLV.append(metadata)

            # Important: do NOT raise from inside the hunter callback.
            # Hunter will print ignored exceptions to stderr, which the VS Code
            # extension interprets as a PyLiveView error.
            return EVAL_ERROR
        raise e


def result_handler(event):
    """
    Called by the `trace` function to handle any actions post
    filter. ie: trace => filter => result_handler

    Side Effects: Results are appended to the global PLV list.
    """

    # Hunter can emit multiple event kinds (line/call/return/exception).
    # PyLiveView's output is intended to be one entry per executed source line.
    if getattr(event, "kind", None) != "line":
        return

    # XXX: WARNING, SIDE EFFECTS MAY INCLUDE:
    global PLV

    # NOTE: Consider refactoring this using
    #      class variables instead of globals.

    # We don't want any whitespace around our
    # source code that could mess up the parser.
    source = event["source"].strip()

    # These are the fields returned from each line
    # of the traced program. This is essentially
    # the metadata returned to the extension in the
    # PLV list.
    metadata = {
        "lineno": event["lineno"],
        "source": source,
    }

    # The annotation will take on this value
    # (if present).
    value = None

    # We'll need to look up any values in the
    # correct scope, so let's grab the locals
    # and globals from the current frame to
    # use later on.
    _globals = event["globals"]
    _locals = event["locals"]

    # This regex does all the heavy lifting. Check out
    # https://regex101.com/r/npWf6w/5 for an example of
    # how it works.
    match = PLV_MACROS.search(source)

    # Sometimes we have to skip an entry to prevent dupes
    skip = False

    # Regex match groups are used for convenience.
    if source not in ["pass", "break", "continue"] and match:

        # TODO: We should be using the ast instead of regex for all cases.
        tree = ast.parse(source)

        # Simplest case.
        if match.group("variable"):
            if event.kind != "call":
                value = parse_eval(
                    match.group("variable"), _globals, _locals, event=event
                )
                if value is EVAL_ERROR:
                    return
            else:
                skip = True

        # A little magic to parse print args
        elif match.group("print"):
            # Print output is now captured by hooked_print after the line executes.
            # We use an empty string as a placeholder.
            value = ""

        # Macros require a few more steps..
        elif match.group("macro"):

            # XXX: This is to help avoid side effects when evaluating expressions
            m_locals_copy = {k: try_deepcopy(v) for k, v in _locals.items()}
            m_globals_copy = {k: try_deepcopy(v) for k, v in _globals.items()}

            if isinstance(tree.body[0], ast.Assign):
                node = tree.body[0]

                if hasattr(node, "target"):
                    target = node.target
                else:
                    target = node.targets[0]

                # Get the variable name
                local_name = target.id

                if isinstance(tree.body[0], ast.AugAssign):
                    operator = {"Mult": "*=", "Add": "+=", "Sub": "-=", "Div": "/="}[
                        node.op
                    ]

                    # This get the value of the local variable from earlier
                    left_side_value = parse_eval(
                        local_name, m_globals_copy, m_locals_copy, event=event
                    )
                    if left_side_value is EVAL_ERROR:
                        return

                    # This evaluates the statement with the infixed operator
                    value = parse_eval(
                        "{} {} {}".format(left_side_value, operator, value), event=event
                    )
                else:
                    # Basic macro to evaluate
                    value = parse_eval(
                        source[source.index("=") + 1 :].strip(),
                        m_globals_copy,
                        m_locals_copy,
                        event=event,
                    )
                    if value is EVAL_ERROR:
                        return

                # Make sure to display the output as a variable assignment
                value = "{} = {}".format(local_name, value)

            else:
                # Basic macro evaluation
                value = parse_eval(
                    match.group("macro").strip(),
                    m_globals_copy,
                    m_locals_copy,
                    event=event,
                )
                if value is EVAL_ERROR:
                    return
        else:
            # Basic macro evaluation
            value = parse_eval(
                match.group("macro").strip(), m_globals_copy, m_locals_copy, event=event
            )
            if value is EVAL_ERROR:
                return

        # Final results are formatted
        metadata["value"] = resultifier(value)

        if not skip and event.kind not in ["return", "call"]:
            # And lastly, update our PLV results list
            PLV.append(metadata)


def filename_filter(filename):
    """
    Removes dependency noise from the output. We're only
    interested in code paths travelled by the target script,
    so this filter traces based on the filename, provided as
    a prop on the `event` dict.

    NOTE: `filename_filter` is a closure over the actual filtering
    function. It captures the target filename for injection
    into the inner scope when the filter is actually run.
    """
    return lambda event: bool(event["filename"] == filename)


def import_and_trace_script(module_name, module_path):
    """
    As the name suggests, this imports and traces the target script.

    Filters for the running script and delegates the
    resulting calls to the result_handler function.

    NOTE: script_path is necessary here for relative imports to work
    """
    # Ensure prints from the traced script are captured by our hooked_print
    # implementation. We replace `builtins.print` while tracing and restore it
    # afterwards to avoid interfering with the host process.
    with script_path(os.path.abspath(os.path.dirname(module_path))):
        builtins.print = hooked_print
        try:
            with trace(filename_filter(module_path), action=result_handler):
                import_file(module_name, module_path)
        finally:
            builtins.print = ORIGINAL_PRINT


def test(snippet):
    """
    TODO
    """
    from tempfile import mkstemp

    testdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests")
    tmpfile_path = mkstemp(suffix=".py", text=True)[1]
    full_path = os.path.abspath(tmpfile_path)
    tmpfile_name = os.path.basename(tmpfile_path).split(".")[0]
    filename = os.path.basename(tmpfile_path)

    with open(full_path, "a", encoding="utf-8") as the_file:
        the_file.write(snippet.strip() + "\n")

    return main(full_path, test=True)


def main(filename, test=False):
    """
    Simply ensures the target script exists and calls
    the import_and_trace_script function. The results
    are stored in the global PLV variable which are
    stringified and outputted to the console on script
    completion.

    We follow convention by returning a proper exit
    code to the shell, so the actual return data
    requires some parsing on the client side. Tags are
    used to simplify this.

    Tag list (tags are the capitalized text):

        On Failure:

            -> `EXISTS_ERROR:`  Happens if the target file doesn't exist.
            -> `RUNTIME_ERROR:` Captures runtime errors from the main function.

        On success:

            -> `PLV:` a string search for this tag returns the
                starting index `i` of the resulting data. This
                can then be sliced from index `i + 4` to get a
                JSON parsable string representation.

                Ex:

                $ python pyliveview.py /some/path/to/script.py
                    ...
                PLV: [{...}, {...}, ...]

                This is always the last item of the result, so
                you need not worry about an ending slice index.
    """
    if not os.path.exists(filename):
        message = "EXISTS_ERROR: " + filename + " doesn't exist"
        print(message, file=sys.stderr)
        return 1

    # The full path to the script (including filename and extension)
    full_path = os.path.abspath(filename)

    # The `import`able name of the target file
    # ie: /home/user/scripts/my_script.py  ->  my_script
    module_name = os.path.basename(full_path).split(".")[0]

    try:

        import_and_trace_script(module_name, full_path)

    except BaseException as e:

        # If there's an error, we try to handle it and
        # send back data that can be used to decorate
        # the offending line.

        # format_exception_only may include a trailing newline on some Python
        # versions. Normalize by stripping trailing newlines so test snapshots
        # remain stable across environments.
        value = traceback.format_exception_only(type(e), e)[0].rstrip("\n")

        if isinstance(e, SyntaxError):
            lineno = getattr(e, "lineno")
            value = e.msg
            source = e.text  # SyntaxError uses 'text' not 'line'
        else:
            _, _, exc_traceback = sys.exc_info()
            tb = traceback.extract_tb(exc_traceback)[-1]
            for i in traceback.extract_tb(exc_traceback):
                if i.filename == filename:
                    tb = i
            lineno = tb.lineno
            source = tb.line

        metadata = {
            "lineno": lineno,
            "source": source.strip() if source else "",
            "value": value,
            "error": True,
        }

        # Avoid appending a duplicate error entry when the same error has
        # already been recorded by the tracer (some tracer versions produce
        # the same error metadata twice). Only append if it's not identical
        # to the last recorded item.
        if not (PLV and PLV[-1] == metadata):
            PLV.append(metadata)
    # handle testing
    if test:
        res = plv_formats()
        PLV.clear()
        try:
            os.remove(full_path)
        except PermissionError:
            # NBD, this can fail on Windows CI tests..
            pass
        return res

    # print the results and return a 0 for the exit code
    plv_prints()
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("ARGS_ERROR: Must provide a file to trace.")
        sys.exit(1)

    sys.exit(main(sys.argv[1]))
