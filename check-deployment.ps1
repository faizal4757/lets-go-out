# Quick setup script for verifying deployment configuration

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Lets Go Out - Deployment Checker" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed
Write-Host "Checking Wrangler installation..." -ForegroundColor Yellow
try {
    $wranglerVersion = wrangler --version 2>$null
    Write-Host "✓ Wrangler installed: $wranglerVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Wrangler not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}

# Check if logged in
Write-Host "`nChecking Cloudflare authentication..." -ForegroundColor Yellow
$whoami = wrangler whoami 2>&1
if ($whoami -match "not authenticated") {
    Write-Host "✗ Not logged in. Run: wrangler login" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✓ Authenticated with Cloudflare" -ForegroundColor Green
}

# Check wrangler.toml configuration
Write-Host "`nChecking wrangler.toml..." -ForegroundColor Yellow
if (Test-Path "wrangler.toml") {
    $tomlContent = Get-Content "wrangler.toml" -Raw
    
    if ($tomlContent -match "YOUR_PRODUCTION_DB_ID_HERE") {
        Write-Host "⚠ Production database ID needs to be updated" -ForegroundColor Yellow
        Write-Host "  Run: wrangler d1 create lets_go_out_prod" -ForegroundColor Gray
    } else {
        Write-Host "✓ Production database configured" -ForegroundColor Green
    }
    
    if ($tomlContent -match "YOUR_PAGES_URL" -or $tomlContent -match "YOUR_WORKER_URL|YOUR_SUBDOMAIN") {
        Write-Host "⚠ Production URLs need to be updated in wrangler.toml" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ wrangler.toml not found" -ForegroundColor Red
    exit 1
}

# Check frontend API configuration
Write-Host "`nChecking frontend configuration..." -ForegroundColor Yellow
if (Test-Path "frontend/api.js") {
    $apiContent = Get-Content "frontend/api.js" -Raw
    
    if ($apiContent -match "YOUR_SUBDOMAIN") {
        Write-Host "⚠ Frontend API URL needs to be updated in frontend/api.js" -ForegroundColor Yellow
    } else {
        Write-Host "✓ Frontend API URL configured" -ForegroundColor Green
    }
} else {
    Write-Host "✗ frontend/api.js not found" -ForegroundColor Red
}

# Check if schema file exists
Write-Host "`nChecking database schema..." -ForegroundColor Yellow
if (Test-Path "backend/schema.sql") {
    Write-Host "✓ schema.sql found" -ForegroundColor Green
} else {
    Write-Host "✗ backend/schema.sql not found" -ForegroundColor Red
}

if (Test-Path "backend/indexes.sql") {
    Write-Host "✓ indexes.sql found" -ForegroundColor Green
} else {
    Write-Host "⚠ backend/indexes.sql not found (optional)" -ForegroundColor Yellow
}

# Summary
Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Create production database:" -ForegroundColor White
Write-Host "   wrangler d1 create lets_go_out_prod" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Initialize database schema:" -ForegroundColor White
Write-Host "   wrangler d1 execute lets_go_out_prod --file=backend/schema.sql --env production" -ForegroundColor Gray
Write-Host "   wrangler d1 execute lets_go_out_prod --file=backend/indexes.sql --env production" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Deploy Worker:" -ForegroundColor White
Write-Host "   wrangler deploy --env production" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Update frontend/api.js with Worker URL" -ForegroundColor White
Write-Host ""
Write-Host "5. Deploy Frontend:" -ForegroundColor White
Write-Host "   cd frontend" -ForegroundColor Gray
Write-Host "   npx wrangler pages deploy . --project-name=lets-go-out" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Update wrangler.toml FRONTEND_URL and redeploy Worker" -ForegroundColor White
Write-Host ""
Write-Host "See DEPLOYMENT.md for full instructions" -ForegroundColor Cyan
Write-Host ""
