// Everything this timer makes a sound with, synthesised rather than loaded, so
// the app ships no audio file at all. A gong with nine partials is about sixty
// lines of oscillator setup, against a download that would have to be fetched,
// decoded and cached before the one moment it is needed — in a venue whose
// network is the thing most likely to be broken.
//
// Every function here takes the `at` time it should sound AT, in the audio
// context's own clock, and nothing here reads `Date.now()`. That is the point:
// `setInterval` drifts by tens of milliseconds under load, and a metronome
// that lands late is worse than no metronome. The caller works out when each
// sound is due and schedules it ahead; the audio thread plays it on time.

/** The note the gong is built on. Raised from 174 on 2026-10-22: at that
 *  pitch the lowest partial sat at 97Hz, which a laptop speaker can barely
 *  move and a room swallows entirely, so what carried was a dull thud rather
 *  than a strike. At 466 the hum tone lands at 261Hz and the strike tone — the
 *  2.0 partial, which is the pitch an ear actually assigns to a struck bell —
 *  at 932Hz, right where a small speaker is loudest and a room is clearest. */
const GONG_FUNDAMENTAL = 466

/** Inharmonic partials, after Risset's bell. The ratios are deliberately not
 *  whole numbers: a harmonic series sounds like an organ, and it is the
 *  mistuned partials beating against each other that make metal sound struck.
 *  Each one decays at its own rate, the high ones fastest, which is what gives
 *  a bell its bright attack and long dark tail. */
const GONG_PARTIALS: ReadonlyArray<{ ratio: number; gain: number; decay: number }> = [
  { ratio: 0.56, gain: 0.8, decay: 7 },
  { ratio: 0.92, gain: 0.7, decay: 6 },
  { ratio: 1.19, gain: 1, decay: 5 },
  { ratio: 1.71, gain: 0.7, decay: 3.6 },
  { ratio: 2, gain: 0.85, decay: 3.2 },
  { ratio: 2.74, gain: 0.4, decay: 2.2 },
  { ratio: 3, gain: 0.35, decay: 1.8 },
  { ratio: 3.76, gain: 0.25, decay: 1.2 },
  { ratio: 4.07, gain: 0.22, decay: 1 },
]

/** The hit itself: a short burst of filtered noise. Without it the partials
 *  swell in and the gong sounds like a synthesiser pad; with it there is a
 *  mallet. */
function strike(ctx: AudioContext, at: number, out: AudioNode): void {
  const length = Math.floor(ctx.sampleRate * 0.12)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const band = ctx.createBiquadFilter()
  band.type = "bandpass"
  band.frequency.value = 2600
  band.Q.value = 0.7
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.4, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12)
  source.connect(band).connect(gain).connect(out)
  source.start(at)
}

/** Time's up. Rings for about seven seconds and is not cancellable, on purpose:
 *  it fires at the moment the clock stops, and the state change that stops it
 *  must not be able to cut it off. */
export function playGong(ctx: AudioContext, at: number = ctx.currentTime): void {
  const master = ctx.createGain()
  master.gain.value = 0.6
  master.connect(ctx.destination)

  const total = GONG_PARTIALS.reduce((sum, p) => sum + p.gain, 0)
  GONG_PARTIALS.forEach((partial, i) => {
    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.value = GONG_FUNDAMENTAL * partial.ratio
    // A couple of cents either way, alternating, so neighbouring partials beat
    // slowly against each other instead of sitting dead still.
    osc.detune.value = i % 2 === 0 ? -2.5 : 2.5
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(partial.gain / total, at + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + partial.decay)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(at + partial.decay + 0.1)
  })

  strike(ctx, at, master)
}

/** The three clocks a countdown can tick with, one per timer in turn. The last
 *  minute always belongs to `watch`, whichever clock ran before it.
 *
 *  Levels are set by ear for a whole session: the clocks peak around -17 to
 *  -25 dBFS so they sit under a facilitator's voice for forty minutes, and the
 *  watch around -11, louder than any of them, because the last minute is
 *  the one part that is meant to be noticed. */
export const TICK_STYLES = ["antique", "grandfather", "digital"] as const
export type TickStyle = (typeof TICK_STYLES)[number]

type Voice = AudioScheduledSourceNode

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
/** One second of white noise per context, reused by every tick: a fresh buffer
 *  per tick would be sixty allocations a minute for the same random numbers. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx)
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, buffer)
  }
  return buffer
}

/** A burst of noise shaped by `filter`, `attack` seconds in and `decay` out.
 *  Starts at a random point in the buffer so no two ticks are the same grain. */
function burst(
  ctx: BaseAudioContext,
  at: number,
  out: AudioNode,
  { type, frequency, q = 0.7, peak, attack, decay }: {
    type: BiquadFilterType
    frequency: number
    q?: number
    peak: number
    attack: number
    decay: number
  }
): Voice {
  const source = ctx.createBufferSource()
  source.buffer = noise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  source.connect(filter).connect(gain).connect(out)
  source.start(at, Math.random() * 0.8)
  source.stop(at + attack + decay + 0.02)
  return source
}

/** A sine that rings and dies: a resonance of whatever was struck. */
function ring(
  ctx: BaseAudioContext,
  at: number,
  out: AudioNode,
  { frequency, peak, attack, decay, type = "sine" }: {
    frequency: number
    peak: number
    attack: number
    decay: number
    type?: OscillatorType
  }
): Voice {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = frequency
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + attack + decay + 0.02)
  return osc
}

const roomCache = new WeakMap<BaseAudioContext, AudioNode>()
/** The hall the grandfather clock stands in: a generated impulse response,
 *  dark and about a second long, so each tick comes back off the walls. Built
 *  once per context and shared, because a convolver per tick would cost far
 *  more than the tick. */
function room(ctx: BaseAudioContext): AudioNode {
  let input = roomCache.get(ctx)
  if (!input) {
    const length = Math.floor(ctx.sampleRate * 1.1)
    const ir = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate
        // Silence for the first few milliseconds, as the nearest wall is a
        // few metres away, then a tail that falls about 60dB over the second.
        data[i] = t < 0.012 ? 0 : (Math.random() * 2 - 1) * Math.exp(-6.5 * t)
      }
    }
    const convolver = ctx.createConvolver()
    convolver.buffer = ir
    const dark = ctx.createBiquadFilter()
    dark.type = "lowpass"
    dark.frequency.value = 1800
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    convolver.connect(dark).connect(wet).connect(ctx.destination)
    input = convolver
    roomCache.set(ctx, input)
  }
  return input
}

/** A small antique clock: a dry escapement snap with a metallic edge, and the
 *  faint chatter of the gear train behind it. Everything is gone inside 40ms. */
function antique(ctx: BaseAudioContext, at: number, beat: number): Voice[] {
  const out = ctx.destination
  const tock = beat % 2 === 1 ? 0.93 : 1
  const voices = [
    burst(ctx, at, out, { type: "highpass", frequency: 2600, peak: 0.128, attack: 0.0004, decay: 0.006 }),
    ring(ctx, at, out, { frequency: 2310 * tock, peak: 0.02, attack: 0.0006, decay: 0.03 }),
    ring(ctx, at, out, { frequency: 3570 * tock, peak: 0.014, attack: 0.0006, decay: 0.02 }),
    ring(ctx, at, out, { frequency: 5130 * tock, peak: 0.008, attack: 0.0006, decay: 0.012 }),
  ]
  // The gear train: three tiny grains just after the snap, each quieter.
  ;[0.009, 0.015, 0.022].forEach((offset, i) => {
    voices.push(burst(ctx, at + offset, out, { type: "bandpass", frequency: 1900, q: 2.5, peak: 0.02 / (i + 1), attack: 0.0004, decay: 0.002 }))
  })
  return voices
}

/** A grandfather clock across the hall: a soft wooden knock with its high end
 *  rolled off, and most of what arrives is the room. Slightly lower on the
 *  tock, the way a pendulum's two beats are never quite the same. */
function grandfather(ctx: BaseAudioContext, at: number, beat: number): Voice[] {
  const tock = beat % 2 === 1 ? 0.9 : 1
  const soft = ctx.createBiquadFilter()
  soft.type = "lowpass"
  soft.frequency.value = 1500
  const dry = ctx.createGain()
  dry.gain.value = 0.5
  soft.connect(dry).connect(ctx.destination)
  soft.connect(room(ctx))
  return [
    burst(ctx, at, soft, { type: "lowpass", frequency: 1200, peak: 0.22, attack: 0.006, decay: 0.03 }),
    ring(ctx, at, soft, { frequency: 190 * tock, peak: 0.09, attack: 0.005, decay: 0.12 }),
    ring(ctx, at, soft, { frequency: 410 * tock, peak: 0.06, attack: 0.005, decay: 0.08 }),
    ring(ctx, at, soft, { frequency: 760 * tock, peak: 0.035, attack: 0.005, decay: 0.05 }),
  ]
}

/** A bedside digital clock: the same short, rounded beep every second, low
 *  enough not to pierce, identical each time so it loops without a seam. */
function digital(ctx: BaseAudioContext, at: number): Voice[] {
  const round = ctx.createBiquadFilter()
  round.type = "lowpass"
  round.frequency.value = 2400
  round.connect(ctx.destination)
  const osc = ctx.createOscillator()
  osc.type = "square"
  osc.frequency.value = 520
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(0.045, at + 0.002)
  gain.gain.setValueAtTime(0.045, at + 0.045)
  gain.gain.linearRampToValueAtTime(0, at + 0.055)
  osc.connect(gain).connect(round)
  osc.start(at)
  osc.stop(at + 0.06)
  return [osc]
}

/** The last minute: a wristwatch held close, all front edge and no tail, so a
 *  rhythm that speeds up stays a rhythm rather than smearing into a buzz. */
function watch(ctx: BaseAudioContext, at: number, beat: number): Voice[] {
  const out = ctx.destination
  const tock = beat % 2 === 1 ? 0.94 : 1
  return [
    burst(ctx, at, out, { type: "highpass", frequency: 4800, peak: 0.33, attack: 0.0002, decay: 0.004 }),
    ring(ctx, at, out, { frequency: 3820 * tock, peak: 0.07, attack: 0.0003, decay: 0.009 }),
    ring(ctx, at, out, { frequency: 1910 * tock, peak: 0.04, attack: 0.0003, decay: 0.012 }),
  ]
}

/** One tick of `style` at `at`. `beat` counts ticks, so alternate ones can be
 *  the tock. Returns its sources so a pause can cancel the ones still to come. */
export function playTick(
  ctx: BaseAudioContext,
  at: number,
  style: TickStyle | "watch",
  beat: number
): Voice[] {
  if (style === "antique") return antique(ctx, at, beat)
  if (style === "grandfather") return grandfather(ctx, at, beat)
  if (style === "digital") return digital(ctx, at)
  return watch(ctx, at, beat)
}

/** The grandfather clock's room between its ticks: a low, quiet bed of air,
 *  faded in and out so it never clicks. Returns the function that stops it. */
export function startRoomTone(ctx: BaseAudioContext): () => void {
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // Brown noise, the low rumble of a room, and the loop's ends brought to
  // zero together so it repeats without a seam.
  let last = 0
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  const fade = Math.floor(ctx.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    data[i] *= i / fade
    data[length - 1 - i] *= i / fade
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const low = ctx.createBiquadFilter()
  low.type = "lowpass"
  low.frequency.value = 500
  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.05, now + 0.6)
  source.connect(low).connect(gain).connect(ctx.destination)
  source.start(now)
  return () => {
    const t = ctx.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(0, t + 0.3)
    source.stop(t + 0.35)
  }
}
