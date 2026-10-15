import { describe, expect, it } from 'vitest'
import { stepSquare } from './boardKeys'

describe('stepSquare', () => {
  it('moves as seen on screen with White at the bottom', () => {
    expect(stepSquare('e2', 'ArrowUp', 'white')).toBe('e3')
    expect(stepSquare('e2', 'ArrowRight', 'white')).toBe('f2')
  })
  it('is mirrored when the board is flipped', () => {
    expect(stepSquare('e7', 'ArrowUp', 'black')).toBe('e6')
    expect(stepSquare('e7', 'ArrowRight', 'black')).toBe('d7')
  })
  it('stops at the edge', () => {
    expect(stepSquare('a8', 'ArrowUp', 'white')).toBe('a8')
    expect(stepSquare('a8', 'ArrowLeft', 'white')).toBe('a8')
    expect(stepSquare('h1', 'ArrowLeft', 'black')).toBe('h1')
  })
})
