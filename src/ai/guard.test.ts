import { describe, expect, it } from 'vitest'
import { checkRewrite } from './guard'

const facts = { san: 'Nf6', verdict: 'Blunder', text: 'This allows mate in 1, starting with Qxf7#. Better was g6.' }

describe('checkRewrite', () => {
  it('accepts a friendlier wording of the same facts', () => {
    expect(checkRewrite(facts, 'Oops — Nf6 lets White play Qxf7#, which is mate in 1. g6 would have kept you safe.')).toBe(
      'Oops — Nf6 lets White play Qxf7#, which is mate in 1. g6 would have kept you safe.',
    )
  })
  it('rejects a move or square that wasn’t in the note', () => {
    expect(checkRewrite(facts, 'Nf6 lets White play Qxf7#. Instead try Nh6 next time.')).toBeNull()
    expect(checkRewrite(facts, 'Watch the weak f7 square: Nf6 allows mate in 1.')).toBeNull()
  })
  it('rejects invented numbers (evaluations)', () => {
    expect(checkRewrite(facts, 'Nf6 drops to −5.3, allowing mate in 1 with Qxf7#.')).toBeNull()
    expect(checkRewrite(facts, 'Nf6 allows mate in 2.')).toBeNull()
  })
  it('rejects chess ideas the coach didn’t name', () => {
    expect(checkRewrite(facts, 'Nf6 walks into a pin and allows mate in 1 with Qxf7#.')).toBeNull()
    expect(checkRewrite({ san: 'e4', verdict: 'Good move', text: 'Good move.' }, 'e4 starts a strong attack!')).toBeNull()
  })
  it('strips markup and rejects empty or rambling answers', () => {
    expect(checkRewrite(facts, '<b>Nf6</b> allows **mate in 1** via Qxf7#.')).toBe('Nf6 allows mate in 1 via Qxf7#.')
    expect(checkRewrite(facts, '')).toBeNull()
    expect(checkRewrite(facts, 'Nf6 allows mate in 1. '.repeat(30))).toBeNull()
  })
  it('check and mate symbols don’t matter for matching', () => {
    expect(checkRewrite(facts, 'After Nf6, Qxf7 is mate in 1. Better was g6.')).not.toBeNull()
  })
})
