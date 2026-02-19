import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
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
            return [...prev.slice(0, -1), {
              ...last,
              content: last.content + msg.payload.delta
            }]
          } else {
            return [...prev, {
              id: msg.payload.sessionId,
              role: 'assistant',
              content: msg.payload.delta,
              timestamp: Date.now()
            }]
          }
        })
      } else if (msg.type === 'session.message.final') {
        // Update final message
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), {
              ...last,
              content: msg.payload.message.content
            }]
          }
          return prev
        })
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
