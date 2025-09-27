// Simplified MCP chat endpoint - connects Claude to Windmill MCP
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  const WINDMILL_HOST = process.env.WINDMILL_HOST || 'https://app.windmill.dev'
  const WINDMILL_TOKEN = process.env.WINDMILL_TOKEN
  const WINDMILL_WORKSPACE = process.env.WINDMILL_WORKSPACE || 'main'

  if (!WINDMILL_TOKEN) {
    return res.status(500).json({
      success: false,
      message: 'Windmill token not configured',
      details: {}
    })
  }

  // Windmill's MCP endpoint URL
  const mcpEndpoint = `${WINDMILL_HOST}/api/mcp/w/${WINDMILL_WORKSPACE}/sse?token=${WINDMILL_TOKEN}`

  try {
    // Send the prompt to Windmill's MCP endpoint
    const response = await fetch(`${WINDMILL_HOST}/api/mcp/w/${WINDMILL_WORKSPACE}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WINDMILL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        system: `You are an automation assistant connected to Windmill.

When users request automations like:
- "Summarize my Gmail every day at 9am" - Create a flow that fetches Gmail messages and schedules it
- "When webhook received, send to Slack" - Create a webhook-triggered flow that sends to Slack
- "Run the sales report now" - Execute an existing flow immediately

Use Windmill's tools to:
1. Create/manage resources (Gmail, Slack OAuth connections)
2. Create scripts and flows
3. Set up schedules
4. Execute flows

Respond concisely with what you created.`
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Windmill MCP error: ${error}`)
    }

    const result = await response.json()

    return res.status(200).json({
      success: true,
      message: result.message || result.response || 'Command executed successfully',
      details: {
        mcpEndpoint: mcpEndpoint,
        actions: result.actions || []
      }
    })
  } catch (error) {
    console.error('Chat error:', error)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process request',
      details: {}
    })
  }
}