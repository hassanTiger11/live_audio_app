// AudioWorkletProcessor for real-time audio streaming
// Runs in audio thread, no buffering, continuous streaming only

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isActive = true
  }

  process(inputs, outputs, parameters) {
    if (!this.isActive) {
      return false
    }

    // Get the first input (microphone) and first channel (mono)
    const input = inputs[0]
    if (!input || input.length === 0) {
      return true
    }

    const channelData = input[0] // Mono channel
    if (!channelData || channelData.length === 0) {
      return true
    }

    // Create a copy of the audio data (Float32Array)
    const audioData = new Float32Array(channelData)

    // Send audio data to main thread immediately (no buffering)
    this.port.postMessage({
      type: 'audioData',
      audioData: audioData,
    })

    // Continue processing
    return true
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor)
