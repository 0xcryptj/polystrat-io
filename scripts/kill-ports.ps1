<#
Kill processes listening on common polystrat dev ports.

Ports:
- 3344 (runner)
- 3399 (api)
- 5173 (web)

Usage:
  powershell -ExecutionPolicy Bypass -File scripts/kill-ports.ps1

Notes:
- Uses netstat to find PIDs.
- Kills ONLY the PIDs bound to those ports.
#>

$ErrorActionPreference = "Stop"

$ports = @(3344, 3399, 5173)

function Get-PidsForPort([int]$port) {
  $lines = netstat -ano | Select-String (":$port\s") | ForEach-Object { $_.Line }
  $pids = @()
  foreach ($l in $lines) {
    # netstat format varies; PID is last column
    $parts = ($l -split "\s+") | Where-Object { $_ -ne "" }
    if ($parts.Length -ge 5) {
      $foundPid = $parts[$parts.Length - 1]
      if ($foundPid -match "^\d+$") { $pids += [int]$foundPid }
    }
  }
  return ($pids | Sort-Object -Unique)
}

$killed = @()
foreach ($p in $ports) {
  $pids = Get-PidsForPort $p
  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Write-Host "Killing PID $procId ($($proc.ProcessName)) on port $p" -ForegroundColor Yellow
      Stop-Process -Id $procId -Force
      $killed += $procId
    } catch {
      Write-Host ("Failed to kill PID {0} on port {1}: {2}" -f $procId, $p, $_.Exception.Message) -ForegroundColor Red
    }
  }
}

if ($killed.Count -eq 0) {
  Write-Host "No processes found on ports: $($ports -join ', ')" -ForegroundColor Green
} else {
  $uniq = $killed | Sort-Object -Unique
  Write-Host ("Killed PIDs: {0}" -f ($uniq -join ", ")) -ForegroundColor Green
}
