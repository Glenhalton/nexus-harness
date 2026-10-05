# Install or remove the `nexus` and `nexus-code` terminal commands for the current user.
# Mirrors apps/desktop/src/terminal-commands.ts: .cmd shims in %USERPROFILE%\.nexus\bin run the
# installed Electron executable in Node mode, and that directory is added to the per-user Path
# (HKCU\Environment, REG_EXPAND_SZ). No administrator rights are needed. Failures never block setup.
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'remove')][string]$Action,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [string]$ExecutableName = 'Nexus Harness.exe'
)
$ErrorActionPreference = 'Stop'

$marker = 'nexus-harness-shim v1'
$binDir = Join-Path $env:USERPROFILE '.nexus\bin'
$executable = Join-Path $InstallDir $ExecutableName
$runtime = Join-Path $InstallDir 'resources\app.asar\dsh'
$commands = [ordered]@{
  'nexus'      = 'node_modules\@nexus-framework\cli\bin\nexus.js'
  'nexus-code' = 'node_modules\@deepseek-ai\dsh\lib\bin.js'
}

function Normalize([string]$entry) {
  $value = $entry.Trim() -replace '^%USERPROFILE%', $env:USERPROFILE
  return ($value -replace '[\\/]+$', '').Replace('/', '\').ToLowerInvariant()
}

$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$path = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$entries = @($path -split ';' | Where-Object { $_.Trim() -ne '' })
$target = Normalize $binDir

if ($Action -eq 'install') {
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  foreach ($name in $commands.Keys) {
    $script = Join-Path $runtime $commands[$name]
    $text = "@echo off`r`n" +
      "rem ${marker}: managed by Nexus Harness; use `"Remove nexus from Terminal`" in the app to remove it.`r`n" +
      "setlocal`r`n" +
      "set ELECTRON_RUN_AS_NODE=1`r`n" +
      "`"$($executable.Replace('%', '%%'))`" `"$($script.Replace('%', '%%'))`" %*`r`n"
    [System.IO.File]::WriteAllText((Join-Path $binDir "$name.cmd"), $text, (New-Object System.Text.UTF8Encoding $false))
  }
  if (-not ($entries | Where-Object { (Normalize $_) -eq $target })) {
    $key.SetValue('Path', (@($entries) + $binDir) -join ';', [Microsoft.Win32.RegistryValueKind]::ExpandString)
  }
} else {
  foreach ($name in $commands.Keys) {
    $file = Join-Path $binDir "$name.cmd"
    if ((Test-Path $file) -and ((Get-Content -Raw $file) -match [regex]::Escape($marker))) { Remove-Item -Force $file }
  }
  if ((Test-Path $binDir) -and -not (Get-ChildItem -Force $binDir)) { Remove-Item -Force $binDir }
  $kept = @($entries | Where-Object { (Normalize $_) -ne $target })
  if ($kept.Count -ne $entries.Count) {
    $key.SetValue('Path', $kept -join ';', [Microsoft.Win32.RegistryValueKind]::ExpandString)
  }
}
$key.Close()
# Setting and clearing a throwaway user variable through .NET broadcasts WM_SETTINGCHANGE to Explorer.
[Environment]::SetEnvironmentVariable('NEXUS_HARNESS_PATH_REFRESH', '1', 'User')
[Environment]::SetEnvironmentVariable('NEXUS_HARNESS_PATH_REFRESH', $null, 'User')
