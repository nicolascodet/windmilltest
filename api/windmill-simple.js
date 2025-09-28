// Simplified Windmill integration - just return mock data for now
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body
  const lowerPrompt = prompt.toLowerCase()

  // Simple intent detection
  let message = ''

  if (lowerPrompt.includes('hi') || lowerPrompt.includes('hello')) {
    message = "👋 Hi! I can help you:\n• 'summarize my emails' - Get email summary\n• 'what's my latest gmail' - See recent emails\n• 'schedule daily summary at 9am' - Set up automation"
  }
  else if (lowerPrompt.includes('gmail') || lowerPrompt.includes('email')) {
    if (lowerPrompt.includes('latest') || lowerPrompt.includes('recent')) {
      // Latest emails
      message = `📬 Your latest emails:

1. **Q4 Planning Meeting**
   From: sarah@company.com
   Please review the attached budget proposal and provide feedback...
   _10 minutes ago_

2. **[PR #234] Feature branch ready**
   From: github@notifications.com
   Your pull request has been approved and merged...
   _25 minutes ago_

3. **Team standup notes**
   From: team@slack.com
   Today's standup: Sprint progress at 85%, blocking issues resolved...
   _1 hour ago_`
    } else {
      // Email summary
      message = `📨 Email Summary (last hour):

1. 📊 Q4 Planning Meeting - Sarah needs budget approval by EOD
2. ✅ GitHub PR #234 merged - Dark mode feature is live
3. 💬 Team standup - Sprint at 85% completion

📊 Total: 3 emails (1 urgent)

💡 Want this automated? Say "schedule daily summary at 9am"`
    }

    // Add schedule suggestion only if not already scheduling
    if (!lowerPrompt.includes('daily') && !lowerPrompt.includes('every') && !lowerPrompt.includes('schedule')) {
      // Already added above
    } else if (lowerPrompt.includes('daily') || lowerPrompt.includes('every') || lowerPrompt.includes('schedule')) {
      message = `✅ I'll set up a daily email summary at 9am

This automation will:
• Check your Gmail every morning
• Summarize important emails
• Send you a digest

_Note: In production, this would create a Windmill flow with schedule_`
    }
  }
  else if (lowerPrompt.includes('slack')) {
    message = `💬 To send Slack messages, try:
• "Send 'Hello team' to #general"
• "Notify #alerts when emails arrive"
• "Schedule daily standup reminder"`
  }
  else {
    message = `I can help you automate tasks! Try:
• "summarize my emails"
• "what's my latest gmail"
• "schedule daily summary at 9am"
• "send slack message"`
  }

  return res.json({
    success: true,
    message,
    details: {
      mock: true,
      note: "Using demo mode - Windmill integration pending"
    }
  })
}