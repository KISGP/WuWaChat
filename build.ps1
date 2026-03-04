$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host "Current script location: $scriptDirectory"

# # 获取 Rust 的 Target Triple
$targetTriple = (rustc -vV | Select-String "host:").ToString().Split(" ")[1]
Write-Host "Target Triple: $targetTriple" 

# 1.  打包 Python 后端
Write-Host ">>> build wuwachat-server.exe" 
Set-Location -Path "$scriptDirectory\wuwachat-server"
$venvPath = ".venv\Scripts\activate"
if (Test-Path -Path $venvPath) {
    . $venvPath
    pyinstaller wuwachat-server.spec
} else {
    Write-Error "Virtual environment not found at .\.venv "
    exit 1
}

# 2. 确保  sidecar 目录存在
$binDir = "$scriptDirectory\wuwachat-ui\src-tauri\bin"
if (!(Test-Path -Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force
}

# 3. 移动并重命名为 Sidecar 格式
Write-Host ">>> Move to $binDir"
Set-Location -Path "$scriptDirectory\wuwachat-server"
$sourceExe = "$scriptDirectory\wuwachat-server\dist\wuwachat-server.exe"
$destExe = "$binDir/wuwachat-server-$targetTriple.exe"

if (Test-Path -Path $sourceExe) {
    Move-Item -Path $sourceExe -Destination $destExe -Force
} else {
    Write-Error "PyInstaller failed to generate $sourceExe. Ensure pyinstaller is installed: uv add --dev pyinstaller"
    exit 1
}

# # 4. 构建 Tauri 应用
Write-Host ">>> build wuwachat-ui.exe"
Set-Location -Path "$scriptDirectory\wuwachat-ui"
$env:CARGO_HTTP_CHECK_REVOKE="false"
npm run tauri build

Set-Location -Path "$scriptDirectory"

# 5. 提取绿色版文件
Write-Host ">>> Move green version files to directory" -ForegroundColor Green
$FinalDir = "$scriptDirectory\dist\$targetTriple"
if (!(Test-Path -Path $FinalDir)) {
    New-Item -ItemType Directory -Path $FinalDir -Force
}

# # 提取 Tauri 编译出的主程序 EXE
$tauriExe = "$scriptDirectory\wuwachat-ui\src-tauri\target\release\wuwachat-ui.exe"
$serverExe = "$scriptDirectory\wuwachat-ui\src-tauri\target\release\wuwachat-server.exe"

$hasTauri = Test-Path -Path $tauriExe
$hasServer = Test-Path -Path $serverExe

if ($hasTauri -and $hasServer) {
    Copy-Item -Path $tauriExe -Destination $FinalDir -Force
    Copy-Item -Path $serverExe -Destination $FinalDir -Force
} else {
    Write-Warning "can not find $tauriExe 或 $serverExe"
}

# 复制 data 目录
$sourceData = "$scriptDirectory\wuwachat-server\data"
$destData = "$FinalDir\data"

if (Test-Path -Path $destData) {
    Remove-Item -Path $destData -Recurse -Force
}

if (Test-Path -Path $sourceData) {
    Copy-Item -Path $sourceData -Destination $destData -Recurse -Force
}
