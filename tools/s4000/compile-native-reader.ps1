param([string]$OutputAssembly)
$ErrorActionPreference='Stop'
if ([System.Environment]::Version.Major -ne 10) {throw 'Run with PowerShell on .NET 10'}
$references = @(Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll' | Select-Object -ExpandProperty FullName)
$references += @('E:\AutoCAD 2027\acdbmgd.dll','E:\AutoCAD 2027\accoremgd.dll')
Add-Type -Path (Join-Path $PSScriptRoot 'NativeMeshExport.cs') -ReferencedAssemblies $references -OutputAssembly $OutputAssembly
Get-Item -LiteralPath $OutputAssembly | Select-Object Name,Length
