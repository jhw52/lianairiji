param(
  [string]$Key = $env:DEPLOY_KEY,
  [string]$Target = "root@8.148.205.121",
  [switch]$WithDeps
)

$ErrorActionPreference = "Stop"
if (-not $Key) { throw "请先设置 DEPLOY_KEY 环境变量，或用 -Key 指定密钥路径" }
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path .tmp | Out-Null

Write-Host "1/4 构建前端…" -ForegroundColor Cyan
npx vite build

Write-Host "2/4 打包…" -ForegroundColor Cyan
tar -czf .tmp\app.tar.gz dist server package.json package-lock.json

Write-Host "3/4 上传…" -ForegroundColor Cyan
scp -i $Key -o StrictHostKeyChecking=accept-new .tmp\app.tar.gz "${Target}:/tmp/app.tar.gz"

Write-Host "4/4 解压并重启…" -ForegroundColor Cyan
$cmd = "tar -xzf /tmp/app.tar.gz -C /opt/lianairiji"
if ($WithDeps) {
  $cmd += " && cd /opt/lianairiji && npm install --omit=dev --no-audit --no-fund"
}
$cmd += " && systemctl restart lianairiji && sleep 2 && curl -s -m 5 http://127.0.0.1/api/health"
ssh -i $Key -o StrictHostKeyChecking=accept-new $Target $cmd

Write-Host "完成。数据目录 /opt/lianairiji/data 未改动。" -ForegroundColor Green
