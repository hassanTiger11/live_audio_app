// Audio management for microphone input and AudioContext lifecycle
export class AudioManager {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private workletNode: AudioWorkletNode | null = null
  private isInitialized = false

  // Audio constraints - must match README requirements
  private readonly AUDIO_CONSTRAINTS = {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Request microphone permission and get audio stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: this.AUDIO_CONSTRAINTS,
      })

      // Create AudioContext (only after user interaction)
      this.audioContext = new AudioContext({
        sampleRate: this.AUDIO_CONSTRAINTS.sampleRate,
      })

      // Resume AudioContext (required for Chrome)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // Load and register AudioWorklet
      await this.audioContext.audioWorklet.addModule('/audio-processor.js')

      this.isInitialized = true
    } catch (error) {
      console.error('Audio initialization failed:', error)
      throw error
    }
  }

  async startStreaming(onAudioData: (audioData: Float32Array) => void): Promise<void> {
    if (!this.isInitialized || !this.audioContext || !this.mediaStream) {
      throw new Error('AudioManager not initialized')
    }

    try {
      // Create source from microphone stream
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)

      // Create AudioWorkletNode
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor')

      // Handle audio data from worklet
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audioData') {
          onAudioData(event.data.audioData)
        }
      }

      // Connect: source -> worklet -> destination (for monitoring)
      source.connect(this.workletNode)
      this.workletNode.connect(this.audioContext.destination)

    } catch (error) {
      console.error('Failed to start audio streaming:', error)
      throw error
    }
  }

  stopStreaming(): void {
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }
  }

  async cleanup(): Promise<void> {
    this.stopStreaming()

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.isInitialized = false
  }

  get isAudioContextSuspended(): boolean {
    return this.audioContext?.state === 'suspended'
  }

  get isAudioContextRunning(): boolean {
    return this.audioContext?.state === 'running'
  }

  // For debugging - log RMS levels
  logRMS(audioData: Float32Array): void {
    const rms = Math.sqrt(
      audioData.reduce((sum, sample) => sum + sample * sample, 0) / audioData.length
    )
    console.log(`Audio RMS: ${rms.toFixed(4)}`)
  }
}
