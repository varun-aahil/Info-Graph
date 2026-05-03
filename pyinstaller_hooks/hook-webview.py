"""Custom PyInstaller hook for pywebview on Windows.

This avoids broad submodule scanning that can crash on older Python patch
versions while still bundling required resources and the WinForms backend.
"""

from PyInstaller.utils.hooks import collect_data_files

datas = collect_data_files("webview")
hiddenimports = ["webview.platforms.winforms"]
