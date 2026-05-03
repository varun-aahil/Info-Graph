Write-Host "Building React Frontend..."
npm run build

Write-Host "Building Python Executable..."
pyinstaller --name "InfoGraph" `
            --onefile `
            --windowed `
            --icon "public/favicon.ico" `
            --add-data "dist;dist" `
            --add-data "backend/.env;.env" `
            --hidden-import "uvicorn.logging" `
            --hidden-import "uvicorn.loops" `
            --hidden-import "uvicorn.loops.auto" `
            --hidden-import "uvicorn.protocols" `
            --hidden-import "uvicorn.protocols.http" `
            --hidden-import "uvicorn.protocols.http.auto" `
            --hidden-import "uvicorn.protocols.websockets" `
            --hidden-import "uvicorn.protocols.websockets.auto" `
            --hidden-import "uvicorn.lifespan" `
            --hidden-import "uvicorn.lifespan.on" `
            desktop_app.py

Write-Host "Done! The executable is located in the 'dist/' folder."
