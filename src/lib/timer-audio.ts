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

/** What ticks when, by the time LEFT, in milliseconds; null for silence.
 *
 *  An antique clock once a minute while there is plenty of time, every second
 *  in the last two minutes, twice a second in the last one; then, for the final
 *  35 seconds, a watch: every second, every half second from 30, every quarter
 *  second from 10, into the gong. Every tick sits on a whole fraction of the
 *  time left, so each change of pace lands on the beat.
 *
 *  Levels are set by ear for a whole session: the clock peaks around -17 dBFS
 *  so it sits under a facilitator's voice, and the watch around -11, louder,
 *  because the end is the one part that is meant to be noticed. */
export function tickFor(leftMs: number): "antique" | "watch" | null {
  if (leftMs <= 0) return null
  const on = (step: number) => leftMs % step === 0
  if (leftMs > 120_000) return on(60_000) ? "antique" : null
  if (leftMs > 60_000) return on(1000) ? "antique" : null
  if (leftMs > 35_000) return on(500) ? "antique" : null
  if (leftMs > 30_000) return on(1000) ? "watch" : null
  if (leftMs > 10_000) return on(500) ? "watch" : null
  return on(250) ? "watch" : null
}

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

/** The final seconds: a wristwatch held close, all front edge and no tail, so a
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
  style: "antique" | "watch",
  beat: number
): Voice[] {
  return style === "antique" ? antique(ctx, at, beat) : watch(ctx, at, beat)
}
