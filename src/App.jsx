import React, { useState, useRef, useEffect } from 'react'
import './App.css'

function App() {
  const [messages, setMessages] = useState([
    { type: 'bot', text: 'Hi! I can help you create automations. Try:\n• "Summarize my Gmail every day at 9am"\n• "When a webhook is received, send a Slack message"\n• "Run the sales report now"' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { type: 'user', text: userMessage }])
    setLoading(true)

    try {
      const response = await fetch('/api/windmill-workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage })
      })

      const result = await response.json()

      setMessages(prev => [...prev, {
        type: 'bot',
        text: result.message,
        details: result.details
      }])
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'bot',
        text: `❌ Error: ${error.message}`,
        error: true
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <div className="chat-container">
        <div className="header">
          <h1>🤖 Automation Assistant</h1>
          <span className="subtitle">Powered by Windmill</span>
        </div>

        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.type}`}>
              <div className="message-bubble">
                {msg.text}
                {msg.details && (
                  <div className="details">
                    {msg.details.webhookUrl && (
                      <div className="webhook-url">
                        <strong>Webhook URL:</strong>
                        <code>{msg.details.webhookUrl}</code>
                      </div>
                    )}
                    {msg.details.flow && (
                      <div className="flow-path">
                        <strong>Flow:</strong> {msg.details.flow}
                      </div>
                    )}
                    {msg.details.jobId && (
                      <div className="job-id">
                        <strong>Job ID:</strong> {msg.details.jobId}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message bot">
              <div className="message-bubble loading">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your automation request..."
            disabled={loading}
            className="input-field"
          />
          <button type="submit" disabled={loading || !input.trim()} className="send-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

export default App