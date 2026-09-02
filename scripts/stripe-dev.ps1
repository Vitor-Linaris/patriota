<#
.SYNOPSIS
  Liga o encaminhamento de eventos do Stripe para a API local e
  actualiza o backend/.env com o novo webhook secret sozinho.

.DESCRIPTION
  O Stripe CLI gera um `webhook secret` NOVO sempre que o comando
  `stripe listen` arranca — o valor de ontem deixa de servir. Correr
  isto à mão significa: abrir uma janela, copiar o whsec_... que
  aparece, colar no .env, e recriar o container da API. Este script
  faz os quatro passos por si, de cada vez que o corre.

  Deixa o `stripe listen` a correr NUMA JANELA PRÓPRIA, visível, porque
  tem de ficar aberta durante todo o teste — fechá-la corta o
  encaminhamento dos eventos.

.USAGE
  Sempre que for testar assinaturas/Stripe:
    powershell -ExecutionPolicy Bypass -File scripts\stripe-dev.ps1

  Para parar: feche a janela do Stripe CLI que este script abriu.
#>

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot "backend\.env"
$logFile = Join-Path $env:TEMP "stripe-listen-patriota.log"

if (-not (Test-Path $envFile)) {
    Write-Error "Não encontrei $envFile — corra este script a partir do repositório."
    exit 1
}

# O instalador do winget só actualiza o PATH em janelas NOVAS.
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")

if (-not (Get-Command stripe -ErrorAction SilentlyContinue)) {
    Write-Error "Stripe CLI não encontrado no PATH. Reabra o terminal ou instale com: winget install --id Stripe.StripeCli -e"
    exit 1
}

Write-Host "A abrir o Stripe CLI numa janela própria — NÃO A FECHE enquanto estiver a testar." -ForegroundColor Yellow

if (Test-Path $logFile) { Remove-Item $logFile }

# Corre numa janela visível e própria (o utilizador vê os eventos a
# chegar em tempo real, o que é útil durante o teste) e ao mesmo tempo
# grava para um ficheiro que este script lê para apanhar o secret.
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User'); stripe listen --forward-to localhost:8585/public/stripe/webhook 2>&1 | Tee-Object -FilePath '$logFile'"
)

Write-Host "A aguardar o webhook secret..." -NoNewline
$secret = $null
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    Write-Host "." -NoNewline
    if (Test-Path $logFile) {
        $match = Select-String -Path $logFile -Pattern "whsec_[a-zA-Z0-9]+" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($match) {
            $secret = $match.Matches[0].Value
            break
        }
    }
}
Write-Host ""

if (-not $secret) {
    Write-Error "Não apanhei o webhook secret em 30s. Veja a janela do Stripe CLI — deve ter falhado a autenticar (corra 'stripe login')."
    exit 1
}

Write-Host "Secret novo: $secret" -ForegroundColor Green

# Substitui só a linha STRIPE_WEBHOOK_SECRET=..., preserva o resto do
# ficheiro tal como está.
$content = Get-Content $envFile
$updated = $content -replace '^STRIPE_WEBHOOK_SECRET=.*$', "STRIPE_WEBHOOK_SECRET=$secret"
Set-Content -Path $envFile -Value $updated

Write-Host "backend/.env actualizado." -ForegroundColor Green
Write-Host "A recriar o container da API para carregar o novo secret..." -ForegroundColor Yellow

Push-Location $repoRoot
try {
    docker compose up -d api
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Pronto. O Stripe está a encaminhar eventos para localhost:8585." -ForegroundColor Green
Write-Host "Deixe a janela do Stripe CLI aberta enquanto testar." -ForegroundColor Yellow
