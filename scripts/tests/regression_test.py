import subprocess
import json
import os
import sys
from tempfile import mkstemp


def run_pyliveview_subprocess(snippet):
    # Create temp file
    fd, tmpfile_path = mkstemp(suffix=".py", text=True)
    os.close(fd)
    full_path = os.path.abspath(tmpfile_path)

    # Path to pyliveview.py
    pyliveview_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pyliveview.py"
    )

    try:
        with open(full_path, "w", encoding="utf-8") as the_file:
            the_file.write(snippet.strip() + "\n")

        # Run pyliveview.py as a subprocess
        result = subprocess.run(
            [sys.executable, pyliveview_path, full_path],
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONIOENCODING": "utf8"},
        )

        # The VS Code extension treats stderr output as a pyliveview error. Ensure pyliveview.py
        # never emits tracebacks/warnings to stderr for normal inputs.
        if result.stderr and result.stderr.strip():
            raise AssertionError(f"pyliveview.py wrote to stderr:\n{result.stderr}")

        if result.returncode != 0:
            raise AssertionError(
                f"pyliveview.py exited with code {result.returncode}.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )

        stdout = result.stdout

        # Parse the PLV: output
        prefix = "PLV: "
        if prefix in stdout:
            start = stdout.find(prefix) + len(prefix)
            # Find the end of the JSON list by counting braces/brackets
            # We need to properly parse JSON to handle nested structures
            json_str = stdout[start:].strip()

            # Find the matching closing bracket for the top-level array
            depth = 0
            in_string = False
            escape_next = False
            end_pos = 0

            for i, char in enumerate(json_str):
                if escape_next:
                    escape_next = False
                    continue
                if char == "\\" and in_string:
                    escape_next = True
                    continue
                if char == '"':
                    in_string = not in_string
                    continue
                if not in_string:
                    if char == "[":
                        depth += 1
                    elif char == "]":
                        depth -= 1
                        if depth == 0:
                            end_pos = i + 1
                            break

            if end_pos > 0:
                json_str = json_str[:end_pos]
            return json_str
        return "[]"

    finally:
        try:
            os.remove(full_path)
        except:
            pass


def test_bare_variable_name_error(snapshot):
    snippet = "asd"
    res = run_pyliveview_subprocess(snippet)
    data = json.loads(res)
    assert len(data) == 1
    assert data[0]["error"] is True
    assert "NameError" in data[0]["value"]
    if snapshot:
        assert res == snapshot


def test_name_error_after_success(snapshot):
    snippet = "a = 1 # ?\nasd"
    res = run_pyliveview_subprocess(snippet)
    data = json.loads(res)
    assert len(data) == 2
    assert data[0]["value"] == "a = 1"
    assert data[1]["error"] is True
    assert "NameError" in data[1]["value"]
    if snapshot:
        assert res == snapshot


def test_syntax_error_robustness(snapshot):
    snippet = "if True"
    res = run_pyliveview_subprocess(snippet)
    data = json.loads(res)
    assert len(data) == 1
    assert data[0]["error"] is True
    assert data[0]["lineno"] == 1
    if snapshot:
        assert res == snapshot


def test_mixed_results_safety(snapshot):
    snippet = "a = 1 # ?\n1/0"
    res = run_pyliveview_subprocess(snippet)
    data = json.loads(res)
    assert len(data) == 2
    assert data[0]["value"] == "a = 1"
    assert data[1]["error"] is True
    assert "ZeroDivisionError" in data[1]["value"]
    if snapshot:
        assert res == snapshot


def test_print_side_effect_safety(snapshot):
    # This scenario used to cause double-execution, leading to [1, 2, 2, 2, 5, 6]
    snippet = r"""
nums1 = [1, 2, 3, 0, 0, 0]
nums2 = [2, 5, 6]
m, n = 3, 3
def merge(nums1, m, nums2, n):
    for i in range(n):
        nums1[m + i] = nums2[i]
    nums1.sort()
print(merge(nums1, m, nums2, n))
"""
    res = run_pyliveview_subprocess(snippet)
    data = json.loads(res)
    # The last element should be the print result
    print_item = [i for i in data if "print" in i["source"]][0]
    # merge returns None, and it should ONLY print None once.
    # If it was double-executed, nums1 would be [1,2,2,2,5,6] but that's a different check.
    # The fix ensures merge is only called once.
    assert print_item["value"] == "None"

    # Check if nums1 is correct by adding a bare var line at the end
    snippet_with_check = snippet + "\nnums1"
    res_check = run_pyliveview_subprocess(snippet_with_check)
    data_check = json.loads(res_check)
    nums1_val = data_check[-1]["value"]
    assert nums1_val == "[1, 2, 2, 3, 5, 6]"
    if snapshot:
        assert res_check == snapshot


if __name__ == "__main__":
    try:
        print("Running test_bare_variable_name_error...")
        test_bare_variable_name_error(None)
        print("Running test_name_error_after_success...")
        test_name_error_after_success(None)
        print("Running test_syntax_error_robustness...")
        test_syntax_error_robustness(None)
        print("Running test_mixed_results_safety...")
        test_mixed_results_safety(None)
        print("Running test_print_side_effect_safety...")
        test_print_side_effect_safety(None)
        print("All tests passed!")
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
