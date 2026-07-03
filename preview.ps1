$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    4173
)
$listener.Start()

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($reader.ReadLine()) { }

            $requestPath = if ($requestLine -match '^GET\s+([^\s]+)') { $Matches[1] } else { "/" }
            $path = [Uri]::UnescapeDataString(($requestPath -split '\?')[0]).TrimStart("/")
            if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
            $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))

            if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
                $extension = [System.IO.Path]::GetExtension($file)
                $contentType = switch ($extension) {
                    ".html" { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "text/javascript; charset=utf-8" }
                    ".svg"  { "image/svg+xml" }
                    default { "application/octet-stream" }
                }
                $body = [System.IO.File]::ReadAllBytes($file)
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            } else {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
                $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            }

            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
        } catch {
            # Browser connections can close early; keep the preview server alive.
        } finally {
            if ($stream) { $stream.Dispose() }
            $client.Dispose()
        }
    }
} finally {
    $listener.Stop()
}
