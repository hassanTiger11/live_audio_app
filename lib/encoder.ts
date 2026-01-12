// Float32 to PCM16 encoder for OpenAI STT
export class PCM16Encoder {
  // Convert Float32Array (-1.0 to 1.0) to PCM16 (16-bit signed integers)
  static encode(float32Array: Float32Array): ArrayBuffer {
    const pcm16Array = new Int16Array(float32Array.length)

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp float32 value to [-1.0, 1.0] range
      const clamped = Math.max(-1.0, Math.min(1.0, float32Array[i]))

      // Convert to 16-bit signed integer
      // Float32 range: -1.0 to 1.0
      // PCM16 range: -32768 to 32767
      pcm16Array[i] = clamped < 0
        ? clamped * 0x8000  // Negative: -1.0 -> -32768
        : clamped * 0x7FFF  // Positive: 1.0 -> 32767
    }

    return pcm16Array.buffer
  }

  // Validate that audio data meets OpenAI requirements
  static validateAudioData(audioData: Float32Array): boolean {
    // Check if data is Float32Array
    if (!(audioData instanceof Float32Array)) {
      console.error('Audio data must be Float32Array')
      return false
    }

    // Check for reasonable audio levels (not all zeros or NaN)
    const hasValidSamples = audioData.some(sample =>
      !isNaN(sample) && sample !== 0 && Math.abs(sample) > 0.0001
    )

    if (!hasValidSamples) {
      console.warn('Audio data appears to be silent or invalid')
    }

    return true
  }
}
