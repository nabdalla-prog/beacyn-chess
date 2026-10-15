// Chess clock arithmetic. The UI ticks; this module only does the math.
import type { Color, TimeControl } from './session'

export interface ClockState {
  w: number
  b: number
  /** Whose clock is running, or null when paused/stopped. */
  running: Color | null
  /** performance.now()/Date.now() timestamp when `running` started. */
  since: number
}

export function startClock(tc: TimeControl, turn: Color, now: number): ClockState {
  return { w: tc.initial * 1000, b: tc.initial * 1000, running: turn, since: now }
}

export function remaining(c: ClockState, color: Color, now: number): number {
  const base = c[color]
  return c.running === color ? Math.max(0, base - (now - c.since)) : base
}

/** The side to move finished its move at `now`: charge time, add increment, switch. */
export function pressClock(c: ClockState, tc: TimeControl, now: number): ClockState {
  if (!c.running) return c
  const mover = c.running
  const left = remaining(c, mover, now)
  return { ...c, [mover]: left + tc.increment * 1000, running: mover === 'w' ? 'b' : 'w', since: now }
}

export function stopClock(c: ClockState, now: number): ClockState {
  if (!c.running) return c
  return { ...c, [c.running]: remaining(c, c.running, now), running: null, since: now }
}

export function formatClock(ms: number): string {
  if (ms < 10000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
