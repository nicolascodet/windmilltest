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

  const intent = parseIntent(prompt)
  let result = { success: false, message: '', details: {} }

  try {
    if (intent.type === 'schedule' && intent.action === 'summarize' && intent.source === 'gmail') {
      const scriptPath = 'f/automations/gmail_summary'
      const flowPath = 'f/automations/gmail_daily_summary'

      // Create Gmail summary script
      await fetch(`${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/scripts/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WINDMILL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: scriptPath,
          language: 'typescript',
          content: getGmailScript(),
          description: 'Fetch and summarize Gmail emails'
        })
      })

      // Create flow
      await fetch(`${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/flows/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WINDMILL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: flowPath,
          value: {
            summary: 'Gmail Daily Summary',
            modules: [{
              id: 'step_0',
              value: {
                type: 'script',
                path: scriptPath,
                input_transforms: {
                  gmail: {
                    type: 'static',
                    value: '$res:u/user/gmail'
                  }
                }
              }
            }]
          },
          deployment_message: 'Created by chat automation'
        })
      })

      // Create schedule
      await fetch(`${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/schedules/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WINDMILL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: `f/schedules/${flowPath.split('/').pop()}`,
          schedule: intent.schedule,
          timezone: 'America/New_York',
          script_path: flowPath,
          is_flow: true,
          args: {},
          enabled: true,
          summary: 'Daily Gmail summary'
        })
      })

      result = {
        success: true,
        message: `✅ Set up daily Gmail summary at ${intent.schedule.split(' ')[1]}:00`,
        details: { flow: flowPath, schedule: intent.schedule }
      }
    } else if (intent.type === 'webhook') {
      const scriptPath = 'f/automations/slack_notify'
      const flowPath = 'f/automations/webhook_to_slack'

      // Create Slack script
      await fetch(`${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/scripts/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WINDMILL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: scriptPath,
          language: 'typescript',
          content: getSlackScript(),
          description: 'Send Slack notification'
        })
      })

      // Create flow with webhook trigger
      await fetch(`${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/flows/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WINDMILL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: flowPath,
          value: {
            summary: 'Webhook to Slack',
            modules: [
              {
                id: 'webhook_trigger',
                value: {
                  type: 'rawscript',
                  content: 'export async function main(webhook_body: any) { return webhook_body }',
                  language: 'typescript'
                }
              },
              {
                id: 'step_1',
                value: {
                  type: 'script',
                  path: scriptPath,
                  input_transforms: {
                    message: {
                      type: 'javascript',
                      expr: 'flow_input.webhook_body.message || "New webhook received"'
                    },
                    channel: {
                      type: 'static',
                      value: '#general'
                    },
                    slack: {
                      type: 'static',
                      value: '$res:u/user/slack'
                    }
                  }
                }
              }
            ]
          },
          deployment_message: 'Created by chat automation'
        })
      })

      const webhookUrl = `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/jobs/run/f/${flowPath}`

      result = {
        success: true,
        message: `✅ Created webhook → Slack automation`,
        details: { flow: flowPath, webhookUrl }
      }
    } else if (intent.immediate) {
      const flowPath = prompt.match(/run\s+(?:the\s+)?([^\s]+)/i)?.[1] || 'gmail_summary'

      const response = await fetch(
        `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/jobs/run/f/automations/${flowPath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )

      const jobId = await response.text()

      result = {
        success: true,
        message: `✅ Started ${flowPath} (Job ID: ${jobId})`,
        details: { jobId }
      }
    } else {
      result = {
        success: false,
        message: "I couldn't understand that request. Try: 'summarize my gmail every day at 9am' or 'when webhook received, send slack message'",
        details: { intent }
      }
    }
  } catch (error) {
    result = {
      success: false,
      message: `Error: ${error.message}`,
      details: {}
    }
  }

  res.status(200).json(result)
}

function parseIntent(prompt) {
  const lowerPrompt = prompt.toLowerCase()
  const intent = {
    type: 'unknown',
    schedule: null,
    trigger: null,
    action: null,
    source: null,
    target: null,
    immediate: false
  }

  if (lowerPrompt.includes('every day') || lowerPrompt.includes('daily')) {
    intent.type = 'schedule'
    const timeMatch = lowerPrompt.match(/at (\d{1,2})(:\d{2})?\s*(am|pm)?/i)
    if (timeMatch) {
      let hour = parseInt(timeMatch[1])
      if (timeMatch[3] === 'pm' && hour < 12) hour += 12
      if (timeMatch[3] === 'am' && hour === 12) hour = 0
      intent.schedule = `0 ${hour} * * *`
    } else {
      intent.schedule = '0 9 * * *'
    }
  }

  if (lowerPrompt.includes('when')) {
    intent.type = 'webhook'
    if (lowerPrompt.includes('airtable')) intent.source = 'airtable'
    if (lowerPrompt.includes('slack')) intent.source = 'slack'
    if (lowerPrompt.includes('gmail')) intent.source = 'gmail'
  }

  if (lowerPrompt.includes('summarize')) {
    intent.action = 'summarize'
    if (lowerPrompt.includes('gmail') || lowerPrompt.includes('email')) {
      intent.source = 'gmail'
    }
  }

  if (lowerPrompt.includes('send')) {
    intent.action = 'send'
    if (lowerPrompt.includes('slack')) intent.target = 'slack'
  }

  if (lowerPrompt.includes('run') && lowerPrompt.includes('now')) {
    intent.immediate = true
  }

  return intent
}

function getGmailScript() {
  return `
import * as wmill from "windmill-client"

type Gmail = {
  token: string
  refresh_token?: string
}

export async function main(
  gmail: Gmail
) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:unread', {
    headers: {
      'Authorization': \`Bearer \${gmail.token}\`
    }
  })

  if (!response.ok) {
    throw new Error(\`Gmail API error: \${response.status}\`)
  }

  const data = await response.json()
  const messages = data.messages || []

  // Fetch details for each message
  const summaries = await Promise.all(
    messages.slice(0, 5).map(async (msg) => {
      const detailRes = await fetch(\`https://gmail.googleapis.com/gmail/v1/users/me/messages/\${msg.id}\`, {
        headers: {
          'Authorization': \`Bearer \${gmail.token}\`
        }
      })

      if (!detailRes.ok) return null

      const detail = await detailRes.json()
      const headers = detail.payload?.headers || []
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject'
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown'

      return \`• \${subject} (from \${from})\`
    })
  )

  return {
    summary: \`Unread emails:\\n\${summaries.filter(Boolean).join('\\n')}\`,
    count: messages.length,
    hasMore: messages.length > 5
  }
}`
}

function getSlackScript() {
  return `
import * as wmill from "windmill-client"

type Slack = {
  token: string
}

export async function main(
  message: string,
  channel: string = "#general",
  slack: Slack
) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${slack.token}\`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel: channel,
      text: message
    })
  })

  if (!response.ok) {
    throw new Error(\`Slack API error: \${response.status}\`)
  }

  const result = await response.json()

  if (!result.ok) {
    throw new Error(\`Slack error: \${result.error}\`)
  }

  return {
    success: true,
    channel: result.channel,
    ts: result.ts,
    message: message
  }
}`
}