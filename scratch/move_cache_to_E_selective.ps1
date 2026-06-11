# This script selectively moves Chrome Caches/Cookies and Gemini Caches/Backups to E:\cache
# The configuration files will remain on the C:\ drive.
# Please close Chrome and Antigravity IDE completely before running this script.

$ErrorActionPreference = "Stop"

# Create destination root directories if they don't exist
$DestRoot = "E:\cache"
if (!(Test-Path $DestRoot)) {
    New-Item -ItemType Directory -Path $DestRoot | Out-Null
}

# ----------------- CHROME REDIRECTION -----------------
$ChromeUserData = "C:\Users\Eternalgy\AppData\Local\Google\Chrome\User Data"
$ChromeDest = "E:\cache\Chrome"

Write-Host "=== PROCESSING GOOGLE CHROME ===" -ForegroundColor Cyan
if (Test-Path $ChromeUserData) {
    # Find all profile folders (e.g. Default, Profile 1, Profile 2, etc.)
    $Profiles = Get-ChildItem $ChromeUserData -Directory | Where-Object { 
        $_.Name -eq "Default" -or $_.Name -like "Profile *" -or $_.Name -eq "System Profile"
    }

    foreach ($Profile in $Profiles) {
        $ProfileName = $Profile.Name
        Write-Host "Processing Chrome Profile: $ProfileName" -ForegroundColor White
        
        # We redirect: Cache, Code Cache, Network (which contains Cookies)
        $FoldersToMove = @("Cache", "Code Cache", "Network")
        
        foreach ($Folder in $FoldersToMove) {
            $SrcPath = Join-Path $Profile.FullName $Folder
            $DstPath = Join-Path $ChromeDest "$ProfileName\$Folder"
            
            if (Test-Path $SrcPath) {
                # Check if it is already a junction
                $fileAttr = (Get-Item $SrcPath).Attributes
                if ($fileAttr -match "ReparsePoint") {
                    Write-Host "  $Folder is already redirected (Junction exists)." -ForegroundColor Yellow
                    continue
                }
                
                # Ensure destination parent folder exists
                $DstParent = Split-Path $DstPath -Parent
                if (!(Test-Path $DstParent)) {
                    New-Item -ItemType Directory -Path $DstParent -Force | Out-Null
                }
                
                if (Test-Path $DstPath) {
                    Write-Host "  Removing existing destination $DstPath..." -ForegroundColor Yellow
                    cmd /c rmdir /s /q "$DstPath"
                }
                
                Write-Host "  Moving $Folder to E:\cache..." -ForegroundColor White
                $ErrorActionPreference = "Continue"
                robocopy $SrcPath $DstPath /E /MOVE /R:1 /W:1
                $ErrorActionPreference = "Stop"
                
                # Create the directory junction
                Write-Host "  Creating junction for $Folder..." -ForegroundColor White
                cmd /c mklink /J "$SrcPath" "$DstPath"
            }
        }
    }
    Write-Host "Chrome cache/cookie redirection complete!" -ForegroundColor Green
} else {
    Write-Host "Chrome User Data path not found." -ForegroundColor Yellow
}

# ----------------- GEMINI REDIRECTION -----------------
$GeminiSource = "C:\Users\Eternalgy\.gemini"
$GeminiDest = "E:\cache\gemini"

Write-Host "`n=== PROCESSING GEMINI / ANTIGRAVITY ===" -ForegroundColor Cyan
if (Test-Path $GeminiSource) {
    # Get all subdirectories EXCEPT 'config' and 'history' (so config/history stay on C:)
    $GeminiFolders = Get-ChildItem $GeminiSource -Directory | Where-Object {
        $_.Name -ne "config" -and $_.Name -ne "history"
    }
    
    foreach ($Folder in $GeminiFolders) {
        $FolderName = $Folder.Name
        $SrcPath = $Folder.FullName
        $DstPath = Join-Path $GeminiDest $FolderName
        
        # Check if already a junction
        $fileAttr = (Get-Item $SrcPath).Attributes
        if ($fileAttr -match "ReparsePoint") {
            Write-Host "  $FolderName is already redirected (Junction exists)." -ForegroundColor Yellow
            continue
        }
        
        # Ensure destination parent folder exists
        $DstParent = Split-Path $DstPath -Parent
        if (!(Test-Path $DstParent)) {
            New-Item -ItemType Directory -Path $DstParent -Force | Out-Null
        }
        
        if (Test-Path $DstPath) {
            Write-Host "  Removing existing destination $DstPath..." -ForegroundColor Yellow
            cmd /c rmdir /s /q "$DstPath"
        }
        
        Write-Host "  Moving $FolderName to E:\cache..." -ForegroundColor White
        $ErrorActionPreference = "Continue"
        robocopy $SrcPath $DstPath /E /MOVE /R:1 /W:1
        $ErrorActionPreference = "Stop"
        
        # Create the directory junction
        Write-Host "  Creating junction for $FolderName..." -ForegroundColor White
        cmd /c mklink /J "$SrcPath" "$DstPath"
    }
    Write-Host "Gemini redirection complete!" -ForegroundColor Green
} else {
    Write-Host "Gemini directory not found." -ForegroundColor Yellow
}

Write-Host "`n=== ALL OPERATIONS COMPLETE ===" -ForegroundColor Green
Read-Host -Prompt "Press Enter to exit"
