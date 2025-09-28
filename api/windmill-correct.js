// Correct Windmill API implementation based on docs
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

  // Parse the MCP URL properly
  // Format: https://app.windmill.dev/api/mcp/w/testing124/sse?token=XXX
  const url = new URL(WINDMILL_MCP_URL)
  const host = `${url.protocol}//${url.host}`
  const token = url.searchParams.get('token')

  // Extract workspace from path: /api/mcp/w/testing124/sse -> testing124
  const pathMatch = url.pathname.match(/\/api\/mcp\/w\/([^\/]+)/)
  const workspace = pathMatch ? pathMatch[1] : 'testing124'

  console.log('Config:', { host, workspace, tokenPrefix: token?.substring(0, 10) })

  const lowerPrompt = prompt.toLowerCase()

  try {
    // Handle different intents
    if (lowerPrompt.includes('hi') || lowerPrompt.includes('hello')) {
      return res.json({
        success: true,
        message: "👋 Hi! I can help you with Windmill automations:\n• 'summarize my emails' - Get email summary\n• 'create a python script' - Generate code\n• 'list my scripts' - See what you have",
        details: { workspace }
      })
    }

    // Test basic API access first
    if (lowerPrompt.includes('test')) {
      const testUrl = `${host}/api/w/${workspace}/scripts/list`
      console.log('Testing:', testUrl)

      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const scripts = await response.json()
        return res.json({
          success: true,
          message: `✅ Connected to Windmill!\n\nWorkspace: ${workspace}\nScripts found: ${scripts.length}`,
          details: { workspace, scriptCount: scripts.length }
        })
      } else {
        return res.json({
          success: false,
          message: `API test failed (${response.status}). Check your token.`,
          details: { status: response.status }
        })
      }
    }

    // Use Windmill's AI endpoint
    if (lowerPrompt.includes('script') || lowerPrompt.includes('code')) {
      const aiUrl = `${host}/api/w/${workspace}/ai/ask`

      const aiResponse = await fetch(aiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          model: 'anthropic:claude-3-5-sonnet' // or whatever model is configured
        })
      })

      if (aiResponse.ok) {
        const result = await aiResponse.json()
        return res.json({
          success: true,
          message: result.answer || result.response || 'Code generated!',
          details: { workspace }
        })
      }
    }

    // List scripts
    if (lowerPrompt.includes('list')) {
      const scriptsUrl = `${host}/api/w/${workspace}/scripts/list`

      const response = await fetch(scriptsUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const scripts = await response.json()
        const scriptList = scripts.slice(0, 5).map(s => `• ${s.path}`).join('\n')

        return res.json({
          success: true,
          message: `📝 Your scripts (${scripts.length} total):\n\n${scriptList || 'No scripts yet'}`,
          details: { workspace, count: scripts.length }
        })
      }
    }

    // Email summary (mock for now)
    if (lowerPrompt.includes('email') || lowerPrompt.includes('gmail')) {
      // In production, this would create/run a Windmill script
      return res.json({
        success: true,
        message: `📧 Email Summary:\n\n1. Meeting invite from Sarah (2 hours ago)\n2. GitHub notifications (5 new)\n3. Team standup notes\n\nTotal: 12 unread emails`,
        details: { workspace }
      })
    }

    // Default response
    return res.json({
      success: true,
      message: `I can help with:\n• 'test connection' - Check API access\n• 'list scripts' - See your scripts\n• 'create python script for X' - Generate code\n• 'summarize emails' - Get email summary`,
      details: { workspace }
    })

  } catch (error) {
    console.error('Error:', error)
    return res.json({
      success: false,
      message: `Error: ${error.message}`,
      details: { error: error.toString() }
    })
  }
}