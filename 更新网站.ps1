$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "1/4 正在检查小厨房功能..." -ForegroundColor Cyan
$testSource = Get-Content -LiteralPath ".\tests\regression-check.ps1" -Raw -Encoding UTF8
Invoke-Expression $testSource

$changes = git status --porcelain
if (-not $changes) {
    Write-Host "没有发现需要发布的新修改。" -ForegroundColor Yellow
    Read-Host "按回车键关闭"
    exit 0
}

Write-Host "2/4 检查通过，准备记录本次更新。" -ForegroundColor Cyan
$message = Read-Host "请输入更新说明（例如：优化手机菜单）"
if ([string]::IsNullOrWhiteSpace($message)) {
    $message = "更新我们的小厨房"
}

Write-Host "3/4 正在保存版本..." -ForegroundColor Cyan
git add .
git commit -m $message

Write-Host "4/4 正在更新线上网站..." -ForegroundColor Cyan
git push

Write-Host ""
Write-Host "更新完成！通常等待 1-3 分钟后即可看到新版本：" -ForegroundColor Green
Write-Host "https://yqc0819-stack.github.io/yqclovewmh-little-kitchen/"
Read-Host "按回车键关闭"
