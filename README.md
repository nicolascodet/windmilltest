# Windmill Chat Automation (MCP-Powered)

A clean chat interface that uses Windmill's Model Context Protocol (MCP) to let users create automations in natural language.

## How It Works

Windmill exposes an MCP endpoint that gives LLMs direct access to:
- Create resources (OAuth connections)
- Create scripts and flows
- Set up schedules
- Execute workflows

Your chat messages are sent to Windmill's MCP, which handles all the automation creation.

## Features

✅ **Natural Language**: "Summarize my Gmail every day at 9am"
✅ **Direct Windmill Integration**: Uses Windmill's native MCP endpoint
✅ **No Manual JSON**: Windmill handles the orchestration
✅ **Real Automations**: Creates actual working flows in your workspace

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

| Variable | Description | Default |
|----------|-------------|---------|
| WINDMILL_HOST | Your Windmill instance | https://app.windmill.dev |
| WINDMILL_TOKEN | API token | (required) |
| WINDMILL_WORKSPACE | Workspace name | main |
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