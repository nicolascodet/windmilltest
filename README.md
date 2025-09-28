# Windmill Chat Automation (MCP-Powered)

A clean chat interface that uses Windmill's Model Context Protocol (MCP) to let users create automations in natural language.

## How It Works

This app bridges your chat to Windmill's automation engine:
1. You type natural language requests
2. The app parses your intent and calls Windmill's REST API
3. Windmill creates real flows, schedules, and webhooks
4. You get back confirmation with details

Note: Windmill's MCP is designed for Claude Desktop/Cursor. This web app uses the REST API directly.

## Features

✅ **Natural Language**: "Summarize my Gmail every day at 9am"
✅ **Direct Windmill Integration**: Uses Windmill's native MCP endpoint
✅ **No Manual JSON**: Windmill handles the orchestration
✅ **Real Automations**: Creates actual working flows in your workspace

## Quick Start

### Option 1: Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nicolascodet/windmilltest)

Then add this environment variable in Vercel:
- `WINDMILL_MCP_URL` - Your complete Windmill MCP endpoint URL (get it from Windmill's MCP settings)

### Option 2: Local Development

```bash
npm install
npm run dev  # Runs on :3000
```

Create `.env.local` file:
```
WINDMILL_MCP_URL=https://app.windmill.dev/api/mcp/w/main/sse?token=your-token
```

## Architecture

```
User Chat → Frontend → /api/chat → Windmill MCP
                                        ↓
                              LLM orchestrates tools:
                              - create_resource()
                              - create_script()
                              - create_flow()
                              - create_schedule()
```

## Supported Commands

| Input | Creates |
|-------|---------|
| "summarize gmail daily at 9am" | Script + Flow + Schedule (0 9 * * *) |
| "when webhook, send slack" | Script + Flow + Webhook URL |
| "run report now" | Immediate job execution |

## API Endpoint

**POST /api/chat**
```json
{
  "prompt": "summarize my emails every day at 9am"
}
```

The endpoint proxies to Windmill's MCP which:
1. Understands the intent
2. Creates necessary resources
3. Builds the automation
4. Returns confirmation

## Windmill MCP Integration

The app connects to Windmill's MCP endpoint:
```
https://YOUR_WINDMILL_HOST/api/mcp/w/WORKSPACE/sse?token=TOKEN
```

MCP provides structured access to all Windmill operations:
- Resources (OAuth connections)
- Scripts and flows
- Schedules and triggers
- Job execution

## Why MCP?

**Without MCP**: Write complex JSON mappings, parse intents, manually call APIs
**With MCP**: Windmill exposes tools, LLM orchestrates them directly

The Model Context Protocol lets Windmill and the LLM communicate directly, removing the need for translation layers.

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| WINDMILL_MCP_URL | Complete MCP endpoint URL from Windmill | https://app.windmill.dev/api/mcp/w/main/sse?token=wm_xxx |

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