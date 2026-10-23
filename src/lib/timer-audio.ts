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

/** One second gone, in the last minute. Two sines rather than one: the high
 *  one is the click you hear, the low one is the body that stops it sounding
 *  like a smoke alarm. Returns its nodes so a pause can cancel the ones that
 *  have not sounded yet. */
export function playTick(ctx: AudioContext, at: number): OscillatorNode[] {
  const voices: ReadonlyArray<[number, number, number]> = [
    [1680, 0.1, 0.035],
    [840, 0.06, 0.05],
  ]
  return voices.map(([frequency, peak, decay]) => {
    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + decay + 0.02)
    return osc
  })
}
