// Test raw Windmill endpoints without workspace
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
  const baseUrl = `${url.protocol}//${url.host}`
  const token = url.searchParams.get('token')

  console.log('Testing raw endpoints without workspace...')

  const endpoints = [
    '/api/version',
    '/api/users/whoami',
    '/api/workspaces',
    '/api/scripts',
    '/api/flows',
    '/api/jobs',
    '/api/workers',
    '/scripts',
    '/flows',
    '/w/testing124/scripts',
    '/workspace/testing124/scripts',
    '/api/workspace/testing124/scripts',
  ]

  let message = `**Raw Endpoint Test**\n\n`
  message += `Base: \`${baseUrl}\`\n`
  message += `Token: \`${token?.substring(0, 10)}...\`\n\n`

  for (const endpoint of endpoints) {
    try {
      const fullUrl = `${baseUrl}${endpoint}`
      console.log('Testing:', fullUrl)

      const response = await fetch(fullUrl, {
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {}
      })

      if (response.ok) {
        message += `✅ ${endpoint} - ${response.status}\n`

        // If it's a list endpoint, show count
        try {
          const data = await response.json()
          if (Array.isArray(data)) {
            message += `   Found ${data.length} items\n`
          } else if (data.email || data.username) {
            message += `   User: ${data.email || data.username}\n`
          }
        } catch (e) {
          // Not JSON, just show OK
        }
      } else {
        message += `❌ ${endpoint} - ${response.status}\n`
      }
    } catch (error) {
      message += `⚠️ ${endpoint} - ${error.message}\n`
    }
  }

  message += `\n**Analysis:**\n`
  message += `The MCP URL format might be different than expected.\n`
  message += `Check Windmill's docs or UI for the exact format.\n\n`
  message += `Your MCP URL:\n\`${WINDMILL_MCP_URL}\`\n\n`
  message += `Maybe try without workspace in the path?\n`
  message += `\`${baseUrl}/api/mcp/sse?token=${token?.substring(0, 10)}...\``

  return res.json({
    success: true,
    message,
    details: {
      mcp_url: WINDMILL_MCP_URL,
      parsed: { baseUrl, token: token?.substring(0, 10) }
    }
  })
}