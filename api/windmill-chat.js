// Simple Windmill automation endpoint using REST API
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

  // Extract base URL and token from MCP URL
  const url = new URL(WINDMILL_MCP_URL)
  const baseUrl = `${url.protocol}//${url.host}`
  const token = url.searchParams.get('token')
  const workspace = url.pathname.match(/\/w\/([^\/]+)/)?.[1] || 'main'

  // Simple intent parsing
  const lowerPrompt = prompt.toLowerCase()

  try {
    // Gmail summary automation
    if (lowerPrompt.includes('gmail') || lowerPrompt.includes('email')) {
      const timeMatch = lowerPrompt.match(/(\d{1,2})\s*(am|pm)/i)
      let hour = 9
      if (timeMatch) {
        hour = parseInt(timeMatch[1])
        if (timeMatch[2] === 'pm' && hour < 12) hour += 12
      }

      // Create flow using Windmill REST API
      const flowPath = `f/chat_automations/gmail_summary_${Date.now()}`

      await fetch(`${baseUrl}/api/w/${workspace}/flows/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: flowPath,
          value: {
            summary: 'Daily Gmail Summary',
            modules: [{
              id: 'summarize',
              value: {
                type: 'rawscript',
                language: 'typescript',
                content: `export async function main() {
                  // In production, this would use Gmail OAuth resource
                  // For demo, returning mock data
                  return {
                    summary: "Your Gmail summary would appear here",
                    unreadCount: 5,
                    importantEmails: ["Meeting at 3pm", "Project update"]
                  }
                }`
              }
            }]
          }
        })
      })

      // Create schedule
      await fetch(`${baseUrl}/api/w/${workspace}/schedules/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: `${flowPath}_schedule`,
          schedule: `0 ${hour} * * *`,
          script_path: flowPath,
          is_flow: true,
          enabled: true,
          args: {}
        })
      })

      return res.json({
        success: true,
        message: `✅ Created Gmail summary scheduled for ${hour}:00 daily`,
        details: {
          flow: flowPath,
          schedule: `Daily at ${hour}:00`
        }
      })
    }

    // Slack webhook automation
    if (lowerPrompt.includes('slack')) {
      const flowPath = `f/chat_automations/slack_webhook_${Date.now()}`

      await fetch(`${baseUrl}/api/w/${workspace}/flows/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: flowPath,
          value: {
            summary: 'Webhook to Slack',
            modules: [{
              id: 'webhook_handler',
              value: {
                type: 'rawscript',
                language: 'typescript',
                content: `export async function main(webhook_body: any) {
                  // In production, this would send to Slack
                  console.log("Webhook received:", webhook_body)
                  return {
                    success: true,
                    message: webhook_body.message || "Webhook processed"
                  }
                }`
              }
            }]
          }
        })
      })

      const webhookUrl = `${baseUrl}/api/w/${workspace}/jobs/run/f/${flowPath}`

      return res.json({
        success: true,
        message: `✅ Created Slack webhook automation`,
        details: {
          webhookUrl: webhookUrl,
          flow: flowPath
        }
      })
    }

    // Run existing flow
    if (lowerPrompt.includes('run')) {
      const flowName = lowerPrompt.match(/run\s+(?:the\s+)?([^\s]+)/i)?.[1] || 'report'

      const response = await fetch(
        `${baseUrl}/api/w/${workspace}/jobs/run/f/chat_automations/${flowName}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )

      if (response.ok) {
        const jobId = await response.text()
        return res.json({
          success: true,
          message: `✅ Started ${flowName}`,
          details: { jobId }
        })
      }
    }

    // Default response
    return res.json({
      success: false,
      message: "Try: 'Summarize my Gmail at 9am' or 'Send webhooks to Slack' or 'Run the sales report'",
      details: {}
    })

  } catch (error) {
    console.error('Windmill error:', error)
    return res.status(500).json({
      success: false,
      message: error.message,
      details: {}
    })
  }
}