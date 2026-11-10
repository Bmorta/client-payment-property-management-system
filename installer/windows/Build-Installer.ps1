[CmdletBinding()]
param([string]$InnoCompiler='')
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$version=(Get-Content (Join-Path $root 'server\package.json') -Raw|ConvertFrom-Json).version
$payload=Join-Path $root "installer\output\REMS-Setup-$version"
if(!(Test-Path (Join-Path $payload 'package-manifest.json'))){throw 'Build the production frontend and run npm run package in installer first.'}
if(!$InnoCompiler){$InnoCompiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'}
if(!(Test-Path -LiteralPath $InnoCompiler)){throw 'Install Inno Setup 6 from jrsoftware.org, then run this build script again.'}
& $InnoCompiler ('/DPayloadRoot='+$payload) ('/DAppVersion='+$version) (Join-Path $PSScriptRoot 'REMS.iss')
if($LASTEXITCODE -ne 0){throw 'Inno Setup build failed.'}
Write-Host 'Installer compiled. This is not a Windows installation acceptance test. Test fresh and populated machines before distribution.'
