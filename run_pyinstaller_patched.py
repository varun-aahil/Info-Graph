import dis
import sys
from PyInstaller.__main__ import run

# Monkey-patch dis._get_const_info to handle the Python 3.10.0 bug
original_get_const_info = dis._get_const_info

def patched_get_const_info(const_index, const_list):
    try:
        return original_get_const_info(const_index, const_list)
    except IndexError:
        # Return a dummy value if the index is out of range
        # This prevents the crash in early Python 3.10 versions
        return None, "None"

dis._get_const_info = patched_get_const_info
print("Applied monkey-patch to dis._get_const_info")

if __name__ == "__main__":
    # Pass all arguments to PyInstaller
    run()
