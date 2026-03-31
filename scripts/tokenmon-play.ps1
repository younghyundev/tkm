param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    [Parameter(Mandatory=$true)]
    [double]$Volume
)

# OGG/non-WAV: CLI player priority chain (ffplay -> mpv -> vlc)

# ffplay: volume 0-100
$ffplay = Get-Command ffplay -ErrorAction SilentlyContinue
if ($ffplay) {
    $ffVol = [math]::Max(0, [math]::Min(100, [int]($Volume * 100)))
    & $ffplay.Source -nodisp -autoexit -volume $ffVol $FilePath 2>$null
    exit 0
}

# mpv: volume 0-100
$mpv = Get-Command mpv -ErrorAction SilentlyContinue
if ($mpv) {
    $mpvVol = [math]::Max(0, [math]::Min(100, [int]($Volume * 100)))
    & $mpv.Source --no-video --volume=$mpvVol $FilePath 2>$null
    exit 0
}

# vlc: check PATH then common install locations
$vlc = Get-Command vlc -ErrorAction SilentlyContinue
if (-not $vlc) {
    $vlcPaths = @(
        "$env:ProgramFiles\VideoLAN\VLC\vlc.exe",
        "${env:ProgramFiles(x86)}\VideoLAN\VLC\vlc.exe"
    )
    foreach ($p in $vlcPaths) {
        if (Test-Path $p) {
            $vlc = Get-Item $p
            break
        }
    }
}
if ($vlc) {
    $vlcGain = [math]::Round($Volume * 2.0, 2).ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $vlcPath = if ($vlc -is [System.Management.Automation.ApplicationInfo]) { $vlc.Source } else { $vlc.FullName }
    & $vlcPath --intf dummy --play-and-exit --gain $vlcGain $FilePath 2>$null
    exit 0
}

# WAV fallback: use MediaPlayer (WPF)
if ($FilePath -match "\.wav$") {
    try {
        Add-Type -AssemblyName PresentationCore
        $player = [System.Windows.Media.MediaPlayer]::new()
        $player.Volume = $Volume
        Register-ObjectEvent -InputObject $player -EventName MediaOpened -SourceIdentifier MediaOpened | Out-Null
        Register-ObjectEvent -InputObject $player -EventName MediaFailed -SourceIdentifier MediaFailed | Out-Null
        $player.Open([uri]::new($FilePath))
        $player.Play()

        $deadline = [datetime]::UtcNow.AddSeconds(5)
        while ([datetime]::UtcNow -lt $deadline) {
            [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke(
                [System.Windows.Threading.DispatcherPriority]::Background,
                [Action]{ }
            )
            $failEvt = Get-Event -SourceIdentifier MediaFailed -ErrorAction SilentlyContinue
            if ($failEvt) { break }
            $evt = Get-Event -SourceIdentifier MediaOpened -ErrorAction SilentlyContinue
            if ($evt) { break }
            Start-Sleep -Milliseconds 50
        }
        if (-not $failEvt -and $player.NaturalDuration.HasTimeSpan) {
            Start-Sleep -Seconds ([math]::Ceiling($player.NaturalDuration.TimeSpan.TotalSeconds))
        }
        Unregister-Event -SourceIdentifier MediaOpened -ErrorAction SilentlyContinue
        Unregister-Event -SourceIdentifier MediaFailed -ErrorAction SilentlyContinue
        $player.Close()
    } catch { }
}

exit 0
