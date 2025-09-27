# Windmill Chat Automation

A white-label chat interface that converts natural language requests into Windmill workflows.

## Features

✅ **Daily Schedules**: "Summarize my Gmail every day at 9am"
✅ **Event Triggers**: "When webhook received, send Slack message"
✅ **Immediate Runs**: "Run the sales report now"
✅ **AI-Powered Intent Parsing** (optional with Claude)

## Quick Start

### Option 1: Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nicolascodet/windmilltest)

Then add these environment variables in Vercel:
- `WINDMILL_HOST` - Your Windmill instance URL
- `WINDMILL_TOKEN` - Your Windmill API token
- `WINDMILL_WORKSPACE` - Workspace name (default: main)

### Option 2: Local Development

```bash
npm install
npm run dev  # Runs on :3000
```

Create `.env.local` file:
```
WINDMILL_HOST=https://app.windmill.dev
WINDMILL_TOKEN=your_token_here
WINDMILL_WORKSPACE=main
```

## Architecture

```
User Input → Intent Parser → Windmill API
                ↓
         Creates Scripts/Flows
                ↓
         Sets up Schedules/Webhooks
```

## Supported Commands

| Input | Creates |
|-------|---------|
| "summarize gmail daily at 9am" | Script + Flow + Schedule (0 9 * * *) |
| "when webhook, send slack" | Script + Flow + Webhook URL |
| "run report now" | Immediate job execution |

## API Endpoints

**POST /api/nl2flow**
```json
{
  "prompt": "summarize my emails every day at 9am"
}
```

Response:
```json
{
  "success": true,
  "message": "✅ Set up daily Gmail summary at 9:00",
  "details": {
    "flow": "f/automations/gmail_daily_summary",
    "schedule": "0 9 * * *"
  }
}
```

## Windmill Integration

The app uses these Windmill endpoints:
- `POST /scripts` - Create automation scripts
- `POST /flows` - Build multi-step workflows
- `POST /schedules` - Set up cron jobs
- `POST /runs/flow/{path}` - Execute immediately
- `GET /flows/{path}` - Get webhook URLs

## Customization

### Branding
Edit `src/App.css`:
- Colors: Update gradient in `.header` and `.send-button`
- Logo: Replace emoji in header
- Fonts: Modify `font-family` in body

### Add New Intents
Edit `server.js` `parseIntent()`:
```javascript
if (lowerPrompt.includes('your_keyword')) {
  intent.type = 'your_type'
  intent.action = 'your_action'
}
```

### Connect New Services
1. Create resource script in `createResourceScript()`
2. Add to intent parser
3. Map to Windmill flow

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| WINDMILL_HOST | Your Windmill instance | https://app.windmill.dev |
| WINDMILL_TOKEN | API token | (required) |
| WINDMILL_WORKSPACE | Workspace name | main |
| ANTHROPIC_API_KEY | For AI parsing | (optional) |
| PORT | Backend port | 3001 |

## Testing

Example flows to test:

```bash
# Daily automation
"Summarize my gmail every day at 3pm"

# Webhook trigger
"When a webhook is received, post to slack"

# Immediate execution
"Run the sales report now"
```

## Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

### Vercel/Netlify
- Deploy frontend from `/dist`
- Run backend on separate service
- Update proxy in `vite.config.js`

## License

MIT