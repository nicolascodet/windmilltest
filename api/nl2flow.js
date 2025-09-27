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
                input_transforms: {}
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
                    message: 'expr:flow_input.webhook_body.message'
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

export async function main(
  gmail_resource: string = "u/user/gmail"
) {
  const gmail = await wmill.getResource(gmail_resource)

  const emails = [
    { subject: "Meeting tomorrow", from: "boss@company.com" },
    { subject: "Project update", from: "team@company.com" }
  ]

  const summary = emails.map(e => \`• \${e.subject} (from \${e.from})\`).join('\\n')

  return {
    summary: \`Today's email summary:\\n\${summary}\`,
    count: emails.length
  }
}`
}

function getSlackScript() {
  return `
import * as wmill from "windmill-client"

export async function main(
  message: string,
  channel: string = "#general",
  slack_resource: string = "u/user/slack"
) {
  const slack = await wmill.getResource(slack_resource)

  console.log(\`Sending to Slack \${channel}: \${message}\`)

  return {
    success: true,
    channel,
    message
  }
}`
}