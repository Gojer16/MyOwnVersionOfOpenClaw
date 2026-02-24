import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  thought?: string
}

function parseAssistantContent(raw: string): { content: string; thought?: string } {
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i)
  const finalMatch = raw.match(/<final>([\s\S]*?)<\/final>/i)

  const thought = thinkMatch?.[1]?.trim()
  const final = finalMatch?.[1]?.trim()

  if (final) {
    return { content: final, thought }
  }

  const contentWithoutTags = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<final>[\s\S]*?<\/final>/gi, '')
    .trim()

  return {
    content: contentWithoutTags || raw,
    thought,
  }
}

export function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // Create session
      send('session.create', {
        senderId: 'web-user',
        channel: 'webchat',
        senderName: 'Web User'
      })
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      
      if (msg.type === 'session.created') {
        setSessionId(msg.payload.sessionId)
      } else if (msg.type === 'session.message.delta') {
        // Append delta to last message
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.id === msg.payload.sessionId) {
            const parsed = parseAssistantContent(last.content + msg.payload.delta)
            return [...prev.slice(0, -1), {
              ...last,
              content: parsed.content,
              thought: parsed.thought
            }]
          } else {
            const parsed = parseAssistantContent(msg.payload.delta)
            return [...prev, {
              id: msg.payload.sessionId,
              role: 'assistant',
              content: parsed.content,
              timestamp: Date.now(),
              thought: parsed.thought
            }]
          }
        })
      } else if (msg.type === 'session.message.final') {
        // Update final message; if no streaming delta arrived, append as new assistant message
        setMessages(prev => {
          const parsed = parseAssistantContent(msg.payload.message.content)
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), {
              ...last,
              content: parsed.content,
              thought: parsed.thought
            }]
          }
          return [...prev, {
            id: msg.payload.sessionId,
            role: 'assistant',
            content: parsed.content,
            timestamp: Date.now(),
            thought: parsed.thought
          }]
        })
      } else if (msg.type === 'agent.response') {
        const content = msg.payload?.content ?? ''
        if (!content) return
        const parsed = parseAssistantContent(content)
        setMessages(prev => [...prev, {
          id: msg.id ?? Math.random().toString(36),
          role: 'assistant',
          content: parsed.content,
          timestamp: Date.now(),
          thought: parsed.thought
        }])
      }
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    return () => ws.close()
  }, [url])

  const send = (type: string, payload: any = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        id: Math.random().toString(36),
        type,
        timestamp: Date.now(),
        payload
      }))
    }
  }

  const sendMessage = (text: string) => {
    if (!sessionId) return

    // Add user message
    setMessages(prev => [...prev, {
      id: Math.random().toString(36),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }])

    // Send to server
    send('session.send_message', {
      sessionId,
      text,
      senderName: 'Web User'
    })
  }

  const reset = () => {
    if (sessionId) {
      send('session.reset', { sessionId })
      setMessages([])
    }
  }

  return { connected, messages, sendMessage, reset, sessionId }
}
