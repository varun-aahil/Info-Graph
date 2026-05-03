Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Building React Frontend..."
npm run build

Write-Host "Building Python Executable..."
# We locate bottle.py and exclude it from analysis because Python 3.10.0's 'dis' module
# crashes on its complex bytecode. We bundle it manually as a data file instead.
$BOTTLE_PATH = python -c "import bottle; print(bottle.__file__)"
Write-Host "Found bottle at: $BOTTLE_PATH"

# We use a patched runner to avoid the Python 3.10.0 'dis' module IndexError crash
python run_pyinstaller_patched.py --name "InfoGraph" `
            --onefile `
            --windowed `
            --icon "public/logo.ico" `
            --additional-hooks-dir "pyinstaller_hooks" `
            --add-data "dist;dist" `
            --add-data "backend/.env;.env" `
            --add-data "$($BOTTLE_PATH);." `
            --exclude-module "bottle" `
            --hidden-import "uvicorn.logging" `
            --hidden-import "uvicorn.loops" `
            --hidden-import "uvicorn.loops.auto" `
            --hidden-import "uvicorn.protocols" `
            --hidden-import "uvicorn.protocols.http" `
            --hidden-import "uvicorn.protocols.http.auto" `
            --exclude-module "websockets" `
            --hidden-import "uvicorn.lifespan" `
            --hidden-import "uvicorn.lifespan.on" `
            desktop_app.py

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller build failed with exit code $LASTEXITCODE."
}

Write-Host "Done! The executable is located in the 'dist/' folder."
