# Deployment Guide

## Prerequisites

1. Install Wrangler CLI: `npm install -g wrangler`
2. Login to Cloudflare: `wrangler login`
3. GitHub OAuth App (optional, for OAuth login)

## Backend Deployment (Cloudflare Workers + D1)

### 1. Create Production Database

```bash
wrangler d1 create lets_go_out_prod
```

Copy the database ID from the output and update it in `wrangler.toml` under `[env.production]`.

### 2. Initialize Database Schema

```bash
# For development
wrangler d1 execute lets_go_out_main --file=backend/schema.sql --env dev

# For production
wrangler d1 execute lets_go_out_prod --file=backend/schema.sql --env production
```

### 3. Set GitHub OAuth Secrets (Optional)

If using GitHub OAuth, set these secrets:

```bash
# For development
wrangler secret put GITHUB_CLIENT_ID --env dev
wrangler secret put GITHUB_CLIENT_SECRET --env dev

# For production
wrangler secret put GITHUB_CLIENT_ID --env production
wrangler secret put GITHUB_CLIENT_SECRET --env production
```

Create GitHub OAuth App:
- Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
- Authorization callback URL: `https://YOUR_WORKER_URL.workers.dev/auth/github/callback`

### 4. Deploy Worker

```bash
# Deploy to development
wrangler deploy --env dev

# Deploy to production
wrangler deploy --env production
```

### 5. Update URLs in wrangler.toml

After first deployment, update these in `wrangler.toml`:
- `FRONTEND_URL`: Your Cloudflare Pages URL
- `GITHUB_REDIRECT_URI`: Your Worker URL + `/auth/github/callback`

## Frontend Deployment (Cloudflare Pages)

### 1. Update API URL

Edit `frontend/api.js` and replace:
```javascript
: "https://lets-go-out.YOUR_SUBDOMAIN.workers.dev"
```
with your actual Worker URL from the deployment above.

### 2. Deploy to Cloudflare Pages

#### Option A: Connect GitHub Repository

1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project" → "Connect to Git"
3. Select your repository
4. Build settings:
   - **Build command**: Leave empty
   - **Build output directory**: `frontend`
   - **Root directory**: `/`

#### Option B: Deploy with Wrangler

```bash
cd frontend
npx wrangler pages deploy . --project-name=lets-go-out
```

### 3. Update Backend CORS

After getting your Pages URL, update `FRONTEND_URL` in `wrangler.toml` and redeploy the Worker:

```bash
wrangler deploy --env production
```

## Post-Deployment Verification

1. Check Worker health: `https://YOUR_WORKER_URL.workers.dev/health`
2. Test frontend: Open your Pages URL
3. Create a test account
4. Create a test outing
5. Check database: `wrangler d1 execute lets_go_out_prod --command="SELECT COUNT(*) FROM users" --env production`

## Performance Monitoring

- Monitor Worker analytics in Cloudflare Dashboard
- Check D1 query performance
- Set up alerts for errors

## Updating After Deployment

```bash
# Update backend
wrangler deploy --env production

# Update frontend
cd frontend
npx wrangler pages deploy . --project-name=lets-go-out
```

## Troubleshooting

### CORS Errors
- Verify `FRONTEND_URL` in wrangler.toml matches your Pages URL exactly
- Redeploy Worker after updating

### Database Connection Errors
- Verify database ID in wrangler.toml
- Check schema was initialized: `wrangler d1 execute lets_go_out_prod --command="SELECT name FROM sqlite_master WHERE type='table'" --env production`

### Session Issues
- Sessions last 24 hours
- Check browser localStorage for session data
- Verify `X-Session-Expires-At` header in API responses
