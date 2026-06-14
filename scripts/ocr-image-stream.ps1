param(
  [string]$Language = "fr-FR"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] > $null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime] > $null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] > $null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] > $null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] > $null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] > $null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetGenericArguments().Count -eq 1 -and
    $_.GetParameters().Count -eq 1 -and
    $_.ToString().Contains("IAsyncOperation")
  } |
  Select-Object -First 1)

if ($null -eq $asTaskGeneric) {
  throw "Unable to find WinRT AsTask overload for IAsyncOperation."
}

function Await-WinRtOperation($Operation, [type]$ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $task = $asTask.Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$lang = [Windows.Globalization.Language]::new($Language)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) {
  throw "No OCR engine available for language $Language"
}

while ($true) {
  $imagePath = [Console]::In.ReadLine()
  if ($null -eq $imagePath) { break }
  if ([string]::IsNullOrWhiteSpace($imagePath)) { continue }

  try {
    $resolved = [System.IO.Path]::GetFullPath($imagePath.Trim())
    $file = Await-WinRtOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)) ([Windows.Storage.StorageFile])
    $stream = Await-WinRtOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
      $decoder = Await-WinRtOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $bitmap = Await-WinRtOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      $result = Await-WinRtOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      [pscustomobject]@{
        path = $resolved
        text = $result.Text
        error = $null
      } | ConvertTo-Json -Compress
    } finally {
      if ($stream -ne $null) { $stream.Dispose() }
    }
  } catch {
    [pscustomobject]@{
      path = $imagePath
      text = ""
      error = $_.Exception.Message
    } | ConvertTo-Json -Compress
  }
}
