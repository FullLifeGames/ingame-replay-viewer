import { describe, expect, it } from 'vitest'

import { type Figures, figuresLine } from './figures'

const MEASURED: Figures = {
  core: 'plain',
  capped: true,
  vsync: false,
  calibration: { cores: 6, loopTurns: 764_854_272, loopMs: 2000 },
  fps5: 9.71,
  fps60: 8.04,
  frames: 4120,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/141.0.0.0',
}

describe('figuresLine', () => {
  it('names the core, the cap, vsync, the device, both rates, the frames and the browser', () => {
    expect(figuresLine(MEASURED)).toBe(
      'Gen 5 spike figures: plain core; speed cap on; vsync off; 6 logical cores; 764.9 million loop turns in 2 s; 9.7 fps over 5 s; 8.0 fps over 60 s; 4120 frames; Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/141.0.0.0',
    )
  })

  it('says what is not measured yet', () => {
    const line = figuresLine({
      ...MEASURED,
      core: 'thread',
      capped: false,
      vsync: true,
      calibration: undefined,
      fps5: undefined,
      fps60: undefined,
      frames: 0,
    })
    expect(line).toContain('thread core; speed cap off; vsync on; device not measured yet;')
    expect(line).toContain(
      'fps over 5 s not measured yet; fps over 60 s not measured yet; 0 frames;',
    )
  })

  it('keeps to one line', () => {
    expect(figuresLine({ ...MEASURED, userAgent: 'a\nb' })).not.toContain('\n')
  })
})
