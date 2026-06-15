# Verify M5_Stack_FIFAWatch firmware path for GrammarBuddy build
$GrammarBuddyRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$DefaultPath = Join-Path (Split-Path $GrammarBuddyRoot -Parent) "M5_Stack_FIFAWatch\firmware"
$Path = if ($env:FIFAWATCH_FIRMWARE) { $env:FIFAWATCH_FIRMWARE } else { $DefaultPath }

Write-Host "FIFAWATCH_FIRMWARE = $Path"

$Hal = Join-Path $Path "main\hal\hal.cpp"
$Components = Join-Path $Path "components\mooncake"

if (-not (Test-Path $Hal)) {
    Write-Error "Missing HAL at $Hal. Clone M5_Stack_FIFAWatch and set FIFAWATCH_FIRMWARE."
    exit 1
}

if (-not (Test-Path $Components)) {
    Write-Warning "components/mooncake not found. Run FIFAWatch component fetch per its README."
    exit 1
}

$IdfManifest = Join-Path (Split-Path $PSScriptRoot -Parent) "main\idf_component.yml"
if (-not (Test-Path $IdfManifest)) {
    Write-Error "Missing main/idf_component.yml (esp_codec_dev, esp-dsp deps)."
    exit 1
}

Write-Host "OK: FIFAWatch firmware ready."
