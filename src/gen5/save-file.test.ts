import { describe, expect, it } from 'vitest'

import {
  CONTENT_NAME,
  isSaveName,
  SAVE_FOLDER,
  SAVE_PATH,
  saveName,
  savePath,
  saveProblem,
  saveQueryProblem,
  saveUrl,
} from './save-file'

describe('the save path in the core', () => {
  it("is the content base name with the core extension in the core's folder of the save folder", () => {
    expect(savePath('black2.nds', 'sav')).toBe('/data/saves/melonDS/black2.sav')
    expect(savePath('game', 'srm')).toBe('/data/saves/melonDS/game.srm')
    expect(SAVE_FOLDER).toBe('/data/saves')
    expect(SAVE_PATH).toBe(savePath(CONTENT_NAME, 'sav'))
  })
})

describe('the save the address names', () => {
  it('reads a plain name', () => {
    expect(saveName('?save=route-20')).toBe('route-20')
    expect(saveName('?threads=1&save=town')).toBe('town')
    expect(saveUrl('route-20')).toBe('/saves/route-20.sav')
  })

  it('gives none for no value, an empty value or a name that climbs or carries a dot', () => {
    expect(saveName('')).toBeUndefined()
    expect(saveName('?save=')).toBeUndefined()
    expect(saveName('?save=../x')).toBeUndefined()
    expect(saveName('?save=x.sav')).toBeUndefined()
    expect(saveName('?save=Route')).toBeUndefined()
    expect(isSaveName('-x')).toBe(false)
    expect(isSaveName('route-20')).toBe(true)
  })

  it('says so when the address names a save that is no save name', () => {
    expect(saveQueryProblem('?save=../x')).toBe(
      'The address asks for the save "../x", which is no save name, so the page does not start the game.',
    )
    expect(saveQueryProblem('?save=')).toBe(
      'The address asks for the save "", which is no save name, so the page does not start the game.',
    )
    expect(saveQueryProblem('?save=route-20')).toBeUndefined()
    expect(saveQueryProblem('?threads=1')).toBeUndefined()
  })
})

describe('the answer for a save', () => {
  it('says the save is missing on a 404', () => {
    expect(saveProblem('route-20', 404, 0)).toBe(
      'The save file route-20.sav is missing on the server, so the page does not start the game.',
    )
  })

  it('says the save is empty on an empty 200', () => {
    expect(saveProblem('route-20', 200, 0)).toBe(
      'The save file route-20.sav on the server is empty, so the page does not start the game.',
    )
  })

  it('names the status of any other failed answer', () => {
    expect(saveProblem('town', 500, 12)).toBe(
      'The server answered 500 for the save file town.sav, so the page does not start the game.',
    )
  })

  it('says the server could not be reached for status 0, as a failed fetch gives', () => {
    expect(saveProblem('town', 0, 0)).toBe(
      'The page could not reach the server for the save file town.sav, so it does not start the game.',
    )
  })

  it('takes a 200 with bytes', () => {
    expect(saveProblem('route-20', 200, 524_288)).toBeUndefined()
  })
})
