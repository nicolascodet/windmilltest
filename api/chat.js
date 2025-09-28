// Simplified MCP chat endpoint - connects Claude to Windmill MCP
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  const WINDMILL_MCP_URL = process.env.WINDMILL_MCP_URL

  if (!WINDMILL_MCP_URL) {
    return res.status(500).json({
      success: false,
      message: 'WINDMILL_MCP_URL not configured',
      details: {}
    })
  }

  try {
    // Send the prompt directly to Windmill's MCP endpoint
    const response = await fetch(WINDMILL_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'completion',
        params: {
          messages: [
            {
              role: 'system',
              content: `You are an automation assistant connected to Windmill workspace.

When users request automations:
- "Summarize my Gmail every day at 9am" - Create a flow with Gmail integration and schedule
- "When webhook received, send to Slack" - Create webhook-triggered flow with Slack
- "Run sales report now" - Execute existing flow

Use available Windmill tools to create resources, scripts, flows, and schedules.`
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        id: Date.now()
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
        mcpEndpoint: WINDMILL_MCP_URL,
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