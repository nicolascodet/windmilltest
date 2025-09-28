// Correct Windmill implementation with proper API token
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  // Get the API token (NOT MCP token!)
  const WINDMILL_TOKEN = process.env.WINDMILL_API_TOKEN
  const WINDMILL_HOST = process.env.WINDMILL_HOST || 'https://app.windmill.dev'
  const WINDMILL_WORKSPACE = process.env.WINDMILL_WORKSPACE || 'testing124'

  if (!WINDMILL_TOKEN) {
    return res.json({
      success: false,
      message: `❌ **Missing API Token**

You need to set WINDMILL_API_TOKEN in Vercel.

**How to get it:**
1. Go to Windmill
2. User → Account settings → Tokens → New token
3. Copy the token (you only see it once!)
4. Add to Vercel: WINDMILL_API_TOKEN=<token>

Also set:
- WINDMILL_HOST=${WINDMILL_HOST}
- WINDMILL_WORKSPACE=${WINDMILL_WORKSPACE}`,
      details: {}
    })
  }

  const lowerPrompt = prompt.toLowerCase()

  try {
    // Test connection
    if (lowerPrompt.includes('test')) {
      console.log('Testing connection...')
      const response = await fetch(
        `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/flows/list`,
        {
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`
          }
        }
      )

      if (response.ok) {
        const flows = await response.json()
        return res.json({
          success: true,
          message: `✅ **Connected to Windmill!**

Workspace: \`${WINDMILL_WORKSPACE}\`
Flows found: ${flows.length}

Try:
• "list flows" - See your flows
• "summarize emails" - Run email summary
• "create schedule" - Set up automation`,
          details: { flowCount: flows.length }
        })
      } else {
        const error = await response.text()
        return res.json({
          success: false,
          message: `❌ Connection failed (${response.status})

Error: ${error}

Check your WINDMILL_API_TOKEN`,
          details: { status: response.status, error }
        })
      }
    }

    // List flows
    if (lowerPrompt.includes('list')) {
      const response = await fetch(
        `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/flows/list`,
        {
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`
          }
        }
      )

      if (response.ok) {
        const flows = await response.json()
        const flowList = flows.slice(0, 5).map(f =>
          `• \`${f.path}\`${f.description ? ` - ${f.description}` : ''}`
        ).join('\n')

        return res.json({
          success: true,
          message: `📋 **Your Flows** (${flows.length} total)

${flowList || 'No flows yet'}

Run a flow: "run <flow_path>"`,
          details: { flows: flows.slice(0, 5) }
        })
      }
    }

    // Run email summary
    if (lowerPrompt.includes('email') || lowerPrompt.includes('gmail')) {
      // First, create a simple email summary script if needed
      const scriptPath = 'f/chat/email_summary'

      // Create the script
      await fetch(
        `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/scripts/create`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: scriptPath,
            content: `export async function main() {
              // Mock email summary - replace with real Gmail API
              return {
                summary: "📧 Email Summary:\\n\\n1. Meeting invite from Sarah\\n2. GitHub PR approved\\n3. Team update from Slack",
                count: 3,
                timestamp: new Date().toISOString()
              }
            }`,
            language: 'typescript',
            description: 'Email summary script'
          })
        }
      )

      // Run it immediately
      const runResponse = await fetch(
        `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/jobs/run/p/${scriptPath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )

      if (runResponse.ok) {
        const jobId = await runResponse.text()

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Get result
        const resultResponse = await fetch(
          `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/jobs/get/${jobId}`,
          {
            headers: {
              'Authorization': `Bearer ${WINDMILL_TOKEN}`
            }
          }
        )

        if (resultResponse.ok) {
          const job = await resultResponse.json()
          const result = job.result || { summary: "Email check completed" }

          return res.json({
            success: true,
            message: result.summary || JSON.stringify(result),
            details: { jobId, result }
          })
        }
      }

      // Fallback
      return res.json({
        success: true,
        message: `📧 Email Summary (mock):

1. Meeting invite from Sarah - 2pm today
2. GitHub: PR #234 approved
3. Slack: 3 messages in #general

Want to schedule this daily? Say "create schedule"`,
        details: {}
      })
    }

    // Create schedule
    if (lowerPrompt.includes('schedule')) {
      const scheduleResponse = await fetch(
        `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/schedules/create`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: 'email_summary_daily',
            schedule: '0 9 * * *',
            timezone: 'America/New_York',
            script_path: 'f/chat/email_summary',
            is_flow: false,
            enabled: true,
            args: {}
          })
        }
      )

      if (scheduleResponse.ok) {
        return res.json({
          success: true,
          message: `✅ **Schedule Created!**

Your email summary will run daily at 9am.

Manage schedules in Windmill UI → Schedules`,
          details: { schedule: '0 9 * * *' }
        })
      }
    }

    // Default help
    return res.json({
      success: true,
      message: `**Windmill Chat**

Available commands:
• \`test\` - Test connection
• \`list flows\` - See your flows
• \`summarize emails\` - Get email summary
• \`create schedule\` - Set up daily automation

Workspace: ${WINDMILL_WORKSPACE}`,
      details: {}
    })

  } catch (error) {
    console.error('Error:', error)
    return res.json({
      success: false,
      message: `Error: ${error.message}

Make sure you have:
1. WINDMILL_API_TOKEN (from Account settings → Tokens)
2. WINDMILL_HOST (default: https://app.windmill.dev)
3. WINDMILL_WORKSPACE (default: testing124)`,
      details: { error: error.toString() }
    })
  }
}