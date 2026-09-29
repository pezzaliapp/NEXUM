"""Resident pages of a file in the kernel page cache, counted once system-wide (mincore(2)).
Used to measure how much of the SQLite database is in memory regardless of how many processes map it.
    python3 bench/phase2/filecache.py data/d2/nexum.db   → {"file_mb": .., "resident_mb": ..}"""

import ctypes
import json
import mmap
import os
import sys

libc = ctypes.CDLL(None, use_errno=True)
libc.mmap.restype = ctypes.c_void_p
libc.mmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_longlong]
libc.munmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
libc.mincore.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_char_p]


def resident(path):
    size = os.path.getsize(path)
    page = mmap.PAGESIZE
    fd = os.open(path, os.O_RDONLY)
    try:
        addr = libc.mmap(None, size, mmap.PROT_READ, mmap.MAP_SHARED, fd, 0)
        if addr in (None, ctypes.c_void_p(-1).value):
            raise OSError(ctypes.get_errno(), "mmap failed")
        try:
            n = (size + page - 1) // page
            vec = ctypes.create_string_buffer(n)
            if libc.mincore(addr, size, vec) != 0:
                raise OSError(ctypes.get_errno(), "mincore failed")
            pages = sum(1 for b in vec.raw if b & 1)
        finally:
            libc.munmap(addr, size)
    finally:
        os.close(fd)
    return {"file_mb": round(size / 1048576, 1), "resident_mb": round(pages * page / 1048576, 1), "page_size": page}


if __name__ == "__main__":
    print(json.dumps(resident(sys.argv[1])))
