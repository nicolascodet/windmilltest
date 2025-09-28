// Test which token type we have
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body
  const WINDMILL_MCP_URL = process.env.WINDMILL_MCP_URL

  if (!WINDMILL_MCP_URL) {
    return res.json({
      success: false,
      message: '❌ WINDMILL_MCP_URL not set',
      details: {}
    })
  }

  // Parse URL
  const url = new URL(WINDMILL_MCP_URL)
  const host = `${url.protocol}//${url.host}`
  const mcpToken = url.searchParams.get('token')
  const pathMatch = url.pathname.match(/\/api\/mcp\/w\/([^\/]+)/)
  const workspace = pathMatch ? pathMatch[1] : 'testing124'

  // Also check for regular API token
  const API_TOKEN = process.env.WINDMILL_API_TOKEN

  let message = `**Token Debugging**\n\n`
  message += `Workspace: \`${workspace}\`\n`
  message += `Host: \`${host}\`\n\n`

  // Test 1: Try MCP token as Bearer token
  message += `**Test 1: MCP token as API token**\n`
  try {
    const response1 = await fetch(`${host}/api/w/${workspace}/scripts/list`, {
      headers: {
        'Authorization': `Bearer ${mcpToken}`
      }
    })
    message += `Result: ${response1.status} ${response1.ok ? '✅' : '❌'}\n`

    if (response1.status === 401) {
      message += `→ MCP token doesn't work as API token\n`
    }
  } catch (e) {
    message += `Error: ${e.message}\n`
  }

  // Test 2: Try without workspace
  message += `\n**Test 2: Without workspace path**\n`
  try {
    const response2 = await fetch(`${host}/api/scripts/list`, {
      headers: {
        'Authorization': `Bearer ${mcpToken}`
      }
    })
    message += `Result: ${response2.status} ${response2.ok ? '✅' : '❌'}\n`
  } catch (e) {
    message += `Error: ${e.message}\n`
  }

  // Test 3: Try the MCP endpoint itself
  message += `\n**Test 3: MCP endpoint directly**\n`
  message += `URL: \`${WINDMILL_MCP_URL}\`\n`
  try {
    const response3 = await fetch(WINDMILL_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1
      })
    })
    message += `Result: ${response3.status} ${response3.ok ? '✅' : '❌'}\n`
  } catch (e) {
    message += `Error: ${e.message}\n`
  }

  // Test 4: If we have a separate API token
  if (API_TOKEN) {
    message += `\n**Test 4: Using separate API token**\n`
    try {
      const response4 = await fetch(`${host}/api/w/${workspace}/scripts/list`, {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`
        }
      })
      message += `Result: ${response4.status} ${response4.ok ? '✅' : '❌'}\n`
    } catch (e) {
      message += `Error: ${e.message}\n`
    }
  } else {
    message += `\n**No separate API token set**\n`
  }

  message += `\n**What you need to do:**\n\n`
  message += `The MCP token is for the MCP protocol, not regular API calls.\n`
  message += `You need a separate API token for REST calls.\n\n`
  message += `1. Go to Windmill UI\n`
  message += `2. Navigate to: **Account Settings → API Tokens**\n`
  message += `3. Create a new token (not MCP token)\n`
  message += `4. Add it to Vercel as: \`WINDMILL_API_TOKEN\`\n\n`
  message += `Your current MCP URL is fine for MCP, but for REST API,\n`
  message += `you need a regular Bearer token.`

  return res.json({
    success: true,
    message,
    details: {
      workspace,
      host,
      hasMcpToken: !!mcpToken,
      hasApiToken: !!API_TOKEN,
      mcpTokenPrefix: mcpToken?.substring(0, 10)
    }
  })
}