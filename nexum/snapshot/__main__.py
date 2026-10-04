"""python3 -m nexum.snapshot build <world> [--out data/snapshot] · parity <world> [...]"""

import sys

from .build import main as build_main


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "parity":
        from .parity import main as parity_main
        return parity_main(argv[1:])
    return build_main(argv)


if __name__ == "__main__":
    sys.exit(main())
