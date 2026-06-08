param (
    [string]$FilePath
)

# Allow overriding certificate path and password via env variables
$certPath = $env:WINDOWS_CERTIFICATE_PATH
$certPassword = $env:WINDOWS_CERTIFICATE_PASSWORD

# If no path is specified, check standard temp/script locations
if ([string]::IsNullOrEmpty($certPath)) {
    if (Test-Path "$env:TEMP\cert.pfx") {
        $certPath = "$env:TEMP\cert.pfx"
    } elseif (Test-Path "$PSScriptRoot\cert.pfx") {
        $certPath = "$PSScriptRoot\cert.pfx"
    }
}

if ([string]::IsNullOrEmpty($certPath) -or !(Test-Path $certPath)) {
    Write-Host "Warning: Windows Code Signing certificate not found ($certPath). Skipping code signing for: $FilePath"
    exit 0
}

Write-Host "Signing: $FilePath"
Write-Host "Using certificate: $certPath"

# Search for signtool.exe
$signtool = "signtool.exe"
if (!(Get-Command $signtool -ErrorAction SilentlyContinue)) {
    # Try to find it in standard Windows SDK installation directories
    $sdkPaths = @(
        "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe",
        "C:\Program Files\Windows Kits\10\bin\*\x64\signtool.exe",
        "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
        "C:\Program Files\Windows Kits\10\bin\x64\signtool.exe"
    )
    foreach ($path in $sdkPaths) {
        $found = Resolve-Path $path -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $signtool = $found.Path
            break
        }
    }
}

if (!(Get-Command $signtool -ErrorAction SilentlyContinue) -and !(Test-Path $signtool)) {
    Write-Error "Error: signtool.exe not found on the system. Please ensure Windows SDK is installed."
    exit 1
}

Write-Host "Using signtool: $signtool"

# Determine timestamp URL
$timestampUrl = "http://timestamp.digicert.com"
if ($env:WINDOWS_TIMESTAMP_URL) {
    $timestampUrl = $env:WINDOWS_TIMESTAMP_URL
}

# Construct arguments
$args = @("sign", "/fd", "SHA256")
if (![string]::IsNullOrEmpty($certPassword)) {
    $args += @("/f", $certPath, "/p", $certPassword)
} else {
    $args += @("/f", $certPath)
}
$args += @("/tr", $timestampUrl, "/td", "SHA256", $FilePath)

# Run signtool
& $signtool $args
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Error "signtool failed with exit code $exitCode"
    exit $exitCode
}

Write-Host "Successfully signed: $FilePath"
exit 0
