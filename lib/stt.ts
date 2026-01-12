import { PCM16Encoder } from './encoder'

export interface STTCallbacks {
  onPartialTranscript: (text: string) => void
  onFinalTranscript: (text: string) => void
  onError: (error: string) => void
  onConnectionStateChange: (connected: boolean) => void
}

export class OpenAIRealtimeSTT {
  private ws: WebSocket | null = null
  private callbacks: STTCallbacks
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private clientSecret: string | null = null

  constructor(callbacks: STTCallbacks) {
    this.callbacks = callbacks
  }

  async connect(): Promise<void> {
    try {
      // Get session token from our API
      const tokenResponse = await fetch('/api/openai-token', {
        method: 'POST',
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}))
        if (errorData.error?.includes('API key') || errorData.error?.includes('your_openai_api_key')) {
          throw new Error('Please set your OPENAI_API_KEY in .env.local file. Get your API key from https://platform.openai.com/account/api-keys')
        }
        throw new Error(`Failed to get OpenAI token: ${errorData.error || 'Unknown error'}`)
      }

      const data = await tokenResponse.json()
      this.clientSecret = data.client_secret

      if (!this.clientSecret) {
        throw new Error('No client_secret received from server')
      }

      // Connect to OpenAI Realtime WebSocket
      // Format: wss://api.openai.com/v1/realtime?model=MODEL&client_secret=SECRET
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview&client_secret=${encodeURIComponent(this.clientSecret)}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = this.handleOpen.bind(this)
      this.ws.onmessage = this.handleMessage.bind(this)
      this.ws.onclose = this.handleClose.bind(this)
      this.ws.onerror = this.handleError.bind(this)

    } catch (error) {
      console.error('Failed to connect to OpenAI:', error)
      this.callbacks.onError(error instanceof Error ? error.message : 'Connection failed')
      throw error
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.callbacks.onConnectionStateChange(false)
  }

  // Send PCM16 audio data to OpenAI
  sendAudioData(audioData: Float32Array): void {
    if (!this.isConnected || !this.ws) {
      // Drop frames if not connected (follows streaming policy)
      return
    }

    try {
      // Validate and encode audio data
      if (!PCM16Encoder.validateAudioData(audioData)) {
        return // Drop invalid frames
      }

      const pcm16Buffer = PCM16Encoder.encode(audioData)

      // Send audio data over WebSocket as base64
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: this.arrayBufferToBase64(pcm16Buffer),
      }))

      // Commit the audio buffer to trigger processing
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.commit',
      }))

    } catch (error) {
      console.error('Failed to send audio data:', error)
      // Continue streaming - don't fail on individual frame errors
    }
  }

  private handleOpen(): void {
    console.log('WebSocket connected to OpenAI Realtime STT')
    this.isConnected = true
    this.reconnectAttempts = 0
    this.callbacks.onConnectionStateChange(true)

    // Configure the session for transcription
    setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: 'You are a real-time speech transcription service. Transcribe the audio input accurately.',
            input_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
            },
          },
        }))
      }
    }, 100)
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data)

      switch (message.type) {
        case 'conversation.item.input_audio_transcription.completed':
          if (message.transcript) {
            this.callbacks.onFinalTranscript(message.transcript)
          }
          break

        case 'response.text.delta':
          if (message.delta) {
            this.callbacks.onPartialTranscript(message.delta)
          }
          break

        case 'error':
          console.error('OpenAI error:', message.error)
          const errorMsg = message.error?.message || message.error?.code || JSON.stringify(message.error) || 'OpenAI error'
          this.callbacks.onError(errorMsg)
          break

        case 'session.created':
        case 'session.updated':
          console.log('Session ready:', message.type)
          break

        default:
          if (message.type) {
            console.log('OpenAI message:', message.type)
          }
      }
    } catch (error) {
      console.error('Failed to parse OpenAI message:', error)
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket closed:', event.code, event.reason)
    this.isConnected = false
    this.callbacks.onConnectionStateChange(false)

    if (event.code !== 1000) {
      const closeReason = event.reason || `WebSocket closed with code ${event.code}`
      this.callbacks.onError(`Connection closed: ${closeReason} (Code: ${event.code})`)
    }
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error)
    this.callbacks.onError('WebSocket connection error')
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
}
