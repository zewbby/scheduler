$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'build-icon.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
