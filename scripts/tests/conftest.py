"""
Pytest configuration and fixtures.

This module checks that required dependencies are installed before running tests.
"""

import sys


def check_required_packages():
    """Check that all required test dependencies are installed."""
    missing = []

    # Check for syrupy (snapshot testing)
    try:
        import syrupy
    except ImportError:
        missing.append("syrupy")

    # Check for hunter (tracing library used by pyliveview)
    try:
        import hunter
    except ImportError:
        missing.append("hunter")

    if missing:
        print("\n" + "=" * 70, file=sys.stderr)
        print("ERROR: Missing required test dependencies!", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(
            f"\nThe following packages are not installed: {', '.join(missing)}",
            file=sys.stderr,
        )
        print("\nTo install them, run:", file=sys.stderr)
        print(f"    pip install {' '.join(missing)}", file=sys.stderr)
        print("\nOr install all dev dependencies:", file=sys.stderr)
        print("    pip install -r requirements_dev.txt", file=sys.stderr)
        print(
            "\nNote: Make sure you're using the correct Python interpreter.",
            file=sys.stderr,
        )
        print(f"Current interpreter: {sys.executable}", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        raise ImportError(f"Missing required packages: {', '.join(missing)}")


# Run the check when pytest loads this conftest
check_required_packages()
