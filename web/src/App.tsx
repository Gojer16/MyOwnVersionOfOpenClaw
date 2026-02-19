import { useState, useRef, useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import './App.css'

export default function App() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { connected, messages, sendMessage, reset } = useWebSocket('ws://localhost:19789/ws')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    // Handle slash commands
    if (input.startsWith('/')) {
      const cmd = input.slice(1).toLowerCase()
      if (cmd === 'reset') {
        reset()
        setInput('')
        return
      }
    }

    sendMessage(input)
    setInput('')
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🦅 Talon WebChat</h1>
        <div className="status">
          <span className={connected ? 'connected' : 'disconnected'}>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <h2>Welcome to Talon</h2>
            <p>Start chatting or try these commands:</p>
            <ul>
              <li><code>/reset</code> - Clear conversation</li>
              <li><code>/status</code> - Show status</li>
              <li><code>/tools</code> - List tools</li>
            </ul>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-role">
              {msg.role === 'user' ? '👤' : '🦅'}
            </div>
            <div className="message-content">
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={!connected}
          autoFocus
        />
        <button type="submit" disabled={!connected || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
