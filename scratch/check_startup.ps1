# This script checks Windows startup locations for PowerShell or cmd commands
# that run on boot/logon.

Write-Host "=== CHECKING REGISTRY RUN KEYS ===" -ForegroundColor Cyan

$runKeys = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce"
)

foreach ($key in $runKeys) {
    if (Test-Path $key) {
        Write-Host "`nKey: $key" -ForegroundColor White
        $properties = Get-ItemProperty -Path $key
        $properties.PSObject.Properties | Where-Object { 
            $_.Name -ne "PSPath" -and $_.Name -ne "PSParentPath" -and $_.Name -ne "PSChildName" -and $_.Name -ne "PSProvider" -and $_.Name -ne "PSDrive"
        } | ForEach-Object {
            Write-Host "  $($_.Name) -> $($_.Value)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n=== CHECKING STARTUP FOLDERS ===" -ForegroundColor Cyan
$startupFolders = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
)

foreach ($folder in $startupFolders) {
    if (Test-Path $folder) {
        Write-Host "`nFolder: $folder" -ForegroundColor White
        Get-ChildItem -Path $folder -File | ForEach-Object {
            Write-Host "  $($_.Name) (Path: $($_.FullName))" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n=== CHECKING TASK SCHEDULER STARTUP TASKS ===" -ForegroundColor Cyan
# Find tasks that run on logon or startup
$scheduledTasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.State -ne "Disabled" -and ($_.Triggers | Where-Object { $_.Enabled -eq $true -and ($_.ClassId -eq "{2a7e7a5c-7ec6-419b-a010-349f57c5f87b}" -or $_.GetType().Name -eq "MSFT_TaskLogonTrigger" -or $_.GetType().Name -eq "MSFT_TaskBootTrigger") })
}

foreach ($task in $scheduledTasks) {
    $actions = $task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }
    # Only report tasks running cmd, powershell, wscript, cscript, powershell.exe, cmd.exe or batch files
    $match = $actions -join " "
    if ($match -match "powershell|cmd|wscript|cscript|bat|vbs|ps1") {
        Write-Host "Task: $($task.TaskName) ($($task.TaskPath))" -ForegroundColor White
        Write-Host "  Trigger: Logon/Boot" -ForegroundColor Yellow
        Write-Host "  Action: $actions" -ForegroundColor Yellow
        Write-Host "  Author: $($task.Author)" -ForegroundColor Gray
    }
}

Write-Host "`n=== CHECK COMPLETE ===" -ForegroundColor Green
