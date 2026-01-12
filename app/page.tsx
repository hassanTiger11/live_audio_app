'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { AudioManager } from '../lib/audio'
import { OpenAIRealtimeSTT } from '../lib/stt'

export default function Home() {
  const [isRecording, setIsRecording] = useState(false)
  const [finalTranscript, setFinalTranscript] = useState('')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  const audioManagerRef = useRef<AudioManager | null>(null)
  const sttClientRef = useRef<OpenAIRealtimeSTT | null>(null)

  // Initialize components on mount
  useEffect(() => {
    audioManagerRef.current = new AudioManager()

    const handleBeforeUnload = () => {
      if (audioManagerRef.current) {
        audioManagerRef.current.cleanup()
      }
      if (sttClientRef.current) {
        sttClientRef.current.disconnect()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (audioManagerRef.current) {
        audioManagerRef.current.cleanup()
      }
      if (sttClientRef.current) {
        sttClientRef.current.disconnect()
      }
    }
  }, [])

  const handlePartialTranscript = useCallback((text: string) => {
    setPartialTranscript(text)
  }, [])

  const handleFinalTranscript = useCallback((text: string) => {
    setFinalTranscript(prev => prev + text + ' ')
    setPartialTranscript('')
  }, [])

  const handleSTTError = useCallback((error: string) => {
    setError(error)
    setIsRecording(false)
  }, [])

  const handleConnectionStateChange = useCallback((connected: boolean) => {
    setConnectionStatus(connected ? 'connected' : 'disconnected')
  }, [])

  const handleStartRecording = useCallback(async () => {
    try {
      setError(null)
      setConnectionStatus('connecting')

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser. Please use Chrome, Edge, or Brave.')
      }

      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        throw new Error('Web Audio API not supported in this browser.')
      }

      if (!window.WebSocket) {
        throw new Error('WebSocket not supported in this browser.')
      }

      if (!audioManagerRef.current) {
        throw new Error('Audio manager not initialized')
      }

      // Initialize audio
      await audioManagerRef.current.initialize()

      // Connect to OpenAI STT
      sttClientRef.current = new OpenAIRealtimeSTT({
        onPartialTranscript: handlePartialTranscript,
        onFinalTranscript: handleFinalTranscript,
        onError: handleSTTError,
        onConnectionStateChange: handleConnectionStateChange,
      })

      await sttClientRef.current.connect()

      // Start streaming audio
      await audioManagerRef.current.startStreaming((audioData) => {
        if (sttClientRef.current) {
          sttClientRef.current.sendAudioData(audioData)
        }
      })

      setIsRecording(true)

    } catch (err) {
      console.error('Failed to start recording:', err)

      let errorMessage = 'Failed to start recording'
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Microphone permission denied. Please allow microphone access and try again.'
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone and try again.'
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Microphone is already in use by another application.'
        } else {
          errorMessage = err.message
        }
      }

      setError(errorMessage)
      setConnectionStatus('disconnected')
      setIsRecording(false)

      // Cleanup on error
      if (sttClientRef.current) {
        sttClientRef.current.disconnect()
        sttClientRef.current = null
      }
      if (audioManagerRef.current) {
        audioManagerRef.current.cleanup()
      }
    }
  }, [handlePartialTranscript, handleFinalTranscript, handleSTTError, handleConnectionStateChange])

  const handleStopRecording = useCallback(() => {
    setIsRecording(false)
    setPartialTranscript('')
    setConnectionStatus('disconnected')

    if (audioManagerRef.current) {
      audioManagerRef.current.stopStreaming()
      audioManagerRef.current.cleanup()
    }

    if (sttClientRef.current) {
      sttClientRef.current.disconnect()
      sttClientRef.current = null
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Real-Time Speech Transcription</h1>
          <p className="text-gray-400">Transcribe your speech instantly using AI</p>
        </header>

        {/* Control Panel */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl shadow-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={connectionStatus === 'connecting'}
                className={`
                  px-8 py-4 rounded-xl font-semibold text-lg
                  transition-all duration-200 transform hover:scale-105 active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                  ${isRecording
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/50'
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/50'
                  }
                `}
              >
                {connectionStatus === 'connecting' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </span>
                ) : isRecording ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                    </svg>
                    Stop Recording
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    Start Recording
                  </span>
                )}
              </button>

              {/* Status Indicator */}
              <div className="flex items-center gap-3">
                <div className={`
                  w-4 h-4 rounded-full transition-all duration-300
                  ${isRecording
                    ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50'
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : connectionStatus === 'connected'
                    ? 'bg-green-500'
                    : 'bg-gray-600'
                  }
                `} />
                <span className="text-gray-300 font-medium">
                  {isRecording
                    ? 'Recording'
                    : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : connectionStatus === 'connected'
                    ? 'Ready'
                    : 'Idle'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-6 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-red-300 text-sm font-medium">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Transcript Display */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gray-800/50 px-6 py-4 border-b border-gray-800">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Transcript
            </h2>
          </div>

          <div className="p-6 min-h-[400px] max-h-[600px] overflow-y-auto">
            {finalTranscript || partialTranscript ? (
              <div className="text-gray-200 leading-relaxed text-lg">
                <span className="whitespace-pre-wrap">{finalTranscript}</span>
                {partialTranscript && (
                  <span className="text-gray-400 italic">{partialTranscript}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                <svg className="h-16 w-16 text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p className="text-gray-500 text-lg mb-2">
                  {isRecording ? 'Speak into your microphone...' : 'Click "Start Recording" to begin'}
                </p>
                <p className="text-gray-600 text-sm">
                  Your transcription will appear here in real-time
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-900/20 border border-blue-800/30 rounded-xl p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to Use
          </h3>
          <ul className="text-sm text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Click <strong className="text-gray-300">"Start Recording"</strong> and allow microphone access when prompted</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Speak clearly into your microphone - transcription appears in real-time</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Partial transcripts appear in <em className="text-gray-300">italics</em>, final transcripts are permanent</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Click <strong className="text-gray-300">"Stop Recording"</strong> to end the session</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
