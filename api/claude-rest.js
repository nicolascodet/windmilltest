// Claude → Windmill REST API bridge
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  const WINDMILL_MCP_URL = process.env.WINDMILL_MCP_URL
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

  if (!WINDMILL_MCP_URL || !ANTHROPIC_API_KEY) {
    return res.status(500).json({
      success: false,
      message: 'Missing WINDMILL_MCP_URL or ANTHROPIC_API_KEY',
      details: {}
    })
  }

  // Extract Windmill config from MCP URL
  const url = new URL(WINDMILL_MCP_URL)
  const baseUrl = `${url.protocol}//${url.host}`
  const token = url.searchParams.get('token')
  const workspace = url.pathname.match(/\/w\/([^\/]+)/)?.[1] || 'main'

  try {
    // Step 1: Ask Claude to parse intent into structured JSON
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Parse this automation request into structured JSON:
"${prompt}"

Output ONLY valid JSON (no markdown, no explanation) in this format:
{
  "action": "create_automation" | "run_flow" | "list" | "chat",
  "automation": {
    "name": "string",
    "description": "string",
    "steps": [
      {
        "type": "resource" | "script" | "flow",
        "operation": "gmail_fetch" | "slack_send" | "summarize" | etc,
        "config": {}
      }
    ],
    "schedule": {
      "enabled": boolean,
      "cron": "cron expression",
      "time": "human readable time"
    },
    "trigger": {
      "type": "webhook" | "email" | "schedule" | null
    }
  },
  "message": "Human-friendly response about what will be created"
}

Examples:
- "hi" → {"action": "chat", "message": "Hi! I can help you create automations. Try 'summarize gmail at 9am'"}
- "summarize gmail at 9am" → {"action": "create_automation", "automation": {...}, "message": "I'll create a daily Gmail summary at 9am"}
- "run sales report" → {"action": "run_flow", "automation": {"name": "sales_report"}, "message": "Running sales report..."}
- "webhook to slack" → {"action": "create_automation", "automation": {...}, "message": "Created webhook → Slack flow"}`
          }
        ]
      })
    })

    if (!claudeResponse.ok) {
      throw new Error('Claude API error')
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content[0]?.text || '{}'

    // Parse Claude's JSON response
    let plan
    try {
      plan = JSON.parse(responseText)
    } catch (e) {
      // Fallback if Claude doesn't return valid JSON
      plan = {
        action: 'chat',
        message: responseText || "I couldn't understand that request. Try 'summarize gmail at 9am'"
      }
    }

    // Step 2: Execute the plan using Windmill REST API
    if (plan.action === 'create_automation' && plan.automation) {
      const flowPath = `f/chat/${plan.automation.name || 'automation'}_${Date.now()}`

      // Create the flow
      const modules = []

      for (const step of (plan.automation.steps || [])) {
        if (step.operation === 'gmail_fetch') {
          modules.push({
            id: `step_${modules.length}`,
            value: {
              type: 'rawscript',
              language: 'typescript',
              content: `export async function main() {
                // Gmail integration would use OAuth resource
                return {
                  emails: ["Email 1", "Email 2", "Email 3"],
                  count: 3
                }
              }`
            }
          })
        } else if (step.operation === 'slack_send') {
          modules.push({
            id: `step_${modules.length}`,
            value: {
              type: 'rawscript',
              language: 'typescript',
              content: `export async function main(input: any) {
                // Slack integration would use OAuth resource
                console.log("Sending to Slack:", input)
                return { sent: true }
              }`
            }
          })
        } else if (step.operation === 'summarize') {
          modules.push({
            id: `step_${modules.length}`,
            value: {
              type: 'rawscript',
              language: 'typescript',
              content: `export async function main(emails: any[]) {
                const summary = emails.map((e, i) => \`\${i+1}. \${e}\`).join('\\n')
                return { summary }
              }`
            }
          })
        }
      }

      // Create flow in Windmill
      const flowResponse = await fetch(`${baseUrl}/api/w/${workspace}/flows/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: flowPath,
          value: {
            summary: plan.automation.description || 'Automation from chat',
            modules: modules.length > 0 ? modules : [{
              id: 'default',
              value: {
                type: 'rawscript',
                language: 'typescript',
                content: 'export async function main() { return { success: true } }'
              }
            }]
          }
        })
      })

      // Create schedule if needed
      if (plan.automation.schedule?.enabled && plan.automation.schedule?.cron) {
        await fetch(`${baseUrl}/api/w/${workspace}/schedules/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: `${flowPath}_schedule`,
            schedule: plan.automation.schedule.cron,
            script_path: flowPath,
            is_flow: true,
            enabled: true
          })
        })
      }

      // Handle webhook trigger
      let webhookUrl = null
      if (plan.automation.trigger?.type === 'webhook') {
        webhookUrl = `${baseUrl}/api/w/${workspace}/jobs/run/f/${flowPath}`
      }

      return res.json({
        success: true,
        message: plan.message || '✅ Created automation',
        details: {
          flow: flowPath,
          schedule: plan.automation.schedule?.time,
          webhookUrl
        }
      })
    }

    // Handle run_flow action
    if (plan.action === 'run_flow' && plan.automation?.name) {
      const runResponse = await fetch(
        `${baseUrl}/api/w/${workspace}/jobs/run/f/chat/${plan.automation.name}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )

      if (runResponse.ok) {
        const jobId = await runResponse.text()
        return res.json({
          success: true,
          message: plan.message || `✅ Started ${plan.automation.name}`,
          details: { jobId }
        })
      } else {
        return res.json({
          success: false,
          message: `Flow '${plan.automation.name}' not found`,
          details: {}
        })
      }
    }

    // Default chat response
    return res.json({
      success: true,
      message: plan.message || "How can I help you automate tasks today?",
      details: {}
    })

  } catch (error) {
    console.error('Error:', error)
    return res.status(500).json({
      success: false,
      message: error.message,
      details: {}
    })
  }
}