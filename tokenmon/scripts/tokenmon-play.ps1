param(
    [string]$FilePath,
    [double]$Volume = 0.5
)
if (-not $FilePath -or -not (Test-Path $FilePath)) { exit 1 }
$ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
if ($ext -eq ".wav") {
    try {
        Add-Type -AssemblyName PresentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $player.Volume = $Volume
        $player.Open([uri]$FilePath)
        $player.Play()
        $timeout = 50; $waited = 0
        while ($player.NaturalDuration.TimeSpan.TotalSeconds -eq 0 -and $waited -lt $timeout) {
            Start-Sleep -Milliseconds 100; $waited++
        }
        $duration = [Math]::Min($player.NaturalDuration.TimeSpan.TotalSeconds, 4)
        Start-Sleep -Seconds $duration
        $player.Close(); exit 0
    } catch {}
}
$players = @("ffplay", "mpv", "vlc")
foreach ($p in $players) {
    $exe = Get-Command $p -ErrorAction SilentlyContinue
    if ($exe) {
        if ($p -eq "ffplay") { & $exe.Source -nodisp -autoexit -volume ([int]($Volume * 100)) $FilePath 2>$null }
        elseif ($p -eq "mpv") { & $exe.Source --no-video --volume=([int]($Volume * 100)) $FilePath 2>$null }
        elseif ($p -eq "vlc") { & $exe.Source --intf dummy --play-and-exit $FilePath 2>$null }
        exit $LASTEXITCODE
    }
}
exit 1
