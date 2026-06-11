# This script finds and stops any running openclaw processes.

$processes = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*openclaw*" }

if ($processes) {
    foreach ($p in $processes) {
        Write-Host "Stopping process ID $($p.ProcessId): $($p.CommandLine)" -ForegroundColor Yellow
        Stop-Process -Id $p.ProcessId -Force
    }
    Write-Host "All openclaw processes have been stopped." -ForegroundColor Green
} else {
    Write-Host "No running openclaw processes were found." -ForegroundColor Yellow
}
