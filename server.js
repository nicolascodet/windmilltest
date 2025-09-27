import express from 'express'
import axios from 'axios'
import Anthropic from '@anthropic-ai/sdk'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
app.use(express.json())

const WINDMILL_HOST = process.env.WINDMILL_HOST || 'https://app.windmill.dev'
const WINDMILL_TOKEN = process.env.WINDMILL_TOKEN
const WINDMILL_WORKSPACE = process.env.WINDMILL_WORKSPACE || 'main'
const PORT = process.env.PORT || 3001

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null

const windmillApi = axios.create({
  baseURL: `${WINDMILL_HOST}/api`,
  headers: {
    'Authorization': `Bearer ${WINDMILL_TOKEN}`,
    'Content-Type': 'application/json'
  }
})

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
    if (lowerPrompt.includes('webhook')) intent.source = 'webhook'
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
    if (lowerPrompt.includes('email')) intent.target = 'email'
  }

  if (lowerPrompt.includes('run') && lowerPrompt.includes('now')) {
    intent.immediate = true
  }

  return intent
}

async function parseWithClaude(prompt) {
  if (!anthropic) {
    return parseIntent(prompt)
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Parse this automation request into structured data:
"${prompt}"

Return JSON with:
- type: "schedule" | "webhook" | "immediate"
- schedule: cron string if scheduled
- trigger: trigger type if webhook
- action: what to do (summarize, send, etc)
- source: data source (gmail, airtable, etc)
- target: where to send (slack, email, etc)
- flowName: suggested flow name
- description: what this does`
      }]
    })

    try {
      const parsed = JSON.parse(response.content[0].text)
      return { ...parseIntent(prompt), ...parsed }
    } catch {
      return parseIntent(prompt)
    }
  } catch (error) {
    console.error('Claude parsing error:', error)
    return parseIntent(prompt)
  }
}

async function createGmailSummaryScript() {
  const code = `
import * as wmill from "windmill-client"

export async function main(
  gmail_resource: string = "u/user/gmail"
) {
  const gmail = await wmill.getResource(gmail_resource)

  // Mock implementation - replace with actual Gmail API calls
  const emails = [
    { subject: "Meeting tomorrow", from: "boss@company.com" },
    { subject: "Project update", from: "team@company.com" }
  ]

  const summary = emails.map(e => \`• \${e.subject} (from \${e.from})\`).join('\\n')

  return {
    summary: \`Today's email summary:\\n\${summary}\`,
    count: emails.length
  }
}
`

  const response = await windmillApi.post(`/w/${WINDMILL_WORKSPACE}/scripts/create`, {
    path: 'f/automations/gmail_summary',
    language: 'typescript',
    content: code,
    description: 'Fetch and summarize Gmail emails'
  })

  return response.data
}

async function createSlackNotificationScript() {
  const code = `
import * as wmill from "windmill-client"

export async function main(
  message: string,
  channel: string = "#general",
  slack_resource: string = "u/user/slack"
) {
  const slack = await wmill.getResource(slack_resource)

  // Mock implementation - replace with actual Slack API calls
  console.log(\`Sending to Slack \${channel}: \${message}\`)

  return {
    success: true,
    channel,
    message
  }
}
`

  const response = await windmillApi.post(`/w/${WINDMILL_WORKSPACE}/scripts/create`, {
    path: 'f/automations/slack_notify',
    language: 'typescript',
    content: code,
    description: 'Send Slack notification'
  })

  return response.data
}

async function createFlow(name, steps, trigger = null) {
  const flowDef = {
    summary: name,
    value: {
      modules: steps.map((step, idx) => ({
        id: `step_${idx}`,
        value: {
          type: 'script',
          path: step.script,
          input_transforms: step.inputs || {}
        }
      }))
    }
  }

  if (trigger) {
    flowDef.ws_error_handler_muted = false
    if (trigger.kind === 'webhook') {
      flowDef.value.modules.unshift({
        id: 'webhook_trigger',
        value: {
          type: 'rawscript',
          content: 'export async function main(webhook_body: any) { return webhook_body }',
          language: 'typescript'
        }
      })
    }
  }

  const response = await windmillApi.post(`/w/${WINDMILL_WORKSPACE}/flows/create`, {
    path: `f/automations/${name.toLowerCase().replace(/\s+/g, '_')}`,
    value: flowDef,
    deployment_message: 'Created by chat automation'
  })

  return response.data
}

async function createSchedule(flowPath, cron, description) {
  const response = await windmillApi.post(`/w/${WINDMILL_WORKSPACE}/schedules/create`, {
    path: `f/schedules/${flowPath.split('/').pop()}`,
    schedule: cron,
    timezone: 'America/New_York',
    script_path: flowPath,
    is_flow: true,
    args: {},
    enabled: true,
    summary: description
  })

  return response.data
}

app.post('/api/nl2flow', async (req, res) => {
  try {
    const { prompt } = req.body

    const intent = anthropic ? await parseWithClaude(prompt) : parseIntent(prompt)

    let result = {
      success: false,
      message: '',
      details: {}
    }

    if (intent.type === 'schedule' && intent.action === 'summarize' && intent.source === 'gmail') {
      await createGmailSummaryScript()

      const flow = await createFlow('Gmail Daily Summary', [
        { script: 'f/automations/gmail_summary' }
      ])

      await createSchedule(
        flow.path,
        intent.schedule,
        'Daily Gmail summary'
      )

      result = {
        success: true,
        message: `✅ Set up daily Gmail summary at ${intent.schedule.split(' ')[1]}:00`,
        details: {
          flow: flow.path,
          schedule: intent.schedule
        }
      }
    } else if (intent.type === 'webhook') {
      await createSlackNotificationScript()

      const flow = await createFlow('Webhook to Slack', [
        { script: 'f/automations/slack_notify', inputs: {
          message: 'expr:flow_input.webhook_body.message'
        }}
      ], { kind: 'webhook' })

      const webhookUrl = `${WINDMILL_HOST}/api/w/${WINDMILL_WORKSPACE}/jobs/run/f/${flow.path}`

      result = {
        success: true,
        message: `✅ Created webhook → Slack automation. Webhook URL: ${webhookUrl}`,
        details: {
          flow: flow.path,
          webhookUrl
        }
      }
    } else if (intent.immediate) {
      const flowPath = prompt.match(/run\s+(?:the\s+)?([^\s]+)/i)?.[1] || 'gmail_summary'

      const runResponse = await windmillApi.post(
        `/w/${WINDMILL_WORKSPACE}/jobs/run/f/automations/${flowPath}`,
        {}
      )

      result = {
        success: true,
        message: `✅ Started ${flowPath} (Job ID: ${runResponse.data})`,
        details: {
          jobId: runResponse.data
        }
      }
    } else {
      result = {
        success: false,
        message: "I couldn't understand that request. Try: 'summarize my gmail every day at 9am' or 'when webhook received, send slack message'",
        details: { intent }
      }
    }

    res.json(result)
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({
      success: false,
      message: error.message,
      details: {}
    })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📡 Windmill host: ${WINDMILL_HOST}`)
  console.log(`🤖 AI parsing: ${anthropic ? 'Claude' : 'Rule-based'}`)
})