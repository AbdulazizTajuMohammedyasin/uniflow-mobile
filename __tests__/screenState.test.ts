import {
  classifyHttpError,
  classifyLoadError,
  handleBack,
  initialScreenState,
  screenReducer,
} from '../src/web/screenState'

describe('screenReducer', () => {
  it('goes from loading to ready', () => {
    expect(screenReducer(initialScreenState, { type: 'loaded' })).toEqual({ phase: 'ready' })
  })

  it('keeps an error when the failed page "finishes" loading, until Retry', () => {
    const failed = screenReducer(initialScreenState, { type: 'failed', error: 'offline' })
    expect(screenReducer(failed, { type: 'loaded' })).toEqual({ phase: 'error', error: 'offline' })
    expect(screenReducer(failed, { type: 'retry' })).toEqual({ phase: 'loading' })
  })

  it('shows an error that happens after the website was showing', () => {
    expect(screenReducer({ phase: 'ready' }, { type: 'failed', error: 'server' })).toEqual({
      phase: 'error',
      error: 'server',
    })
  })
})

describe('classifyLoadError', () => {
  it('ignores navigations the app stopped itself', () => {
    expect(classifyLoadError({ code: -999, domain: 'NSURLErrorDomain' }, true)).toBeNull()
    expect(classifyLoadError({ code: 102, domain: 'WebKitErrorDomain' }, true)).toBeNull()
    expect(classifyLoadError({ code: -3 }, true)).toBeNull()
  })

  it('tells "no internet" apart from "UniFlow is unreachable"', () => {
    expect(classifyLoadError({ code: -1009, domain: 'NSURLErrorDomain' }, false)).toBe('offline')
    expect(classifyLoadError({ code: -2 }, false)).toBe('offline')
    expect(classifyLoadError({ code: -2 }, true)).toBe('unreachable')
    expect(classifyLoadError({ code: -1001, domain: 'NSURLErrorDomain' }, null)).toBe('unreachable')
    expect(classifyLoadError({ code: -999, domain: 'OtherDomain' }, true)).toBe('unreachable')
  })
})

describe('classifyHttpError', () => {
  it('only replaces the website for server errors', () => {
    expect(classifyHttpError(502)).toBe('server')
    expect(classifyHttpError(500)).toBe('server')
    expect(classifyHttpError(404)).toBeNull()
    expect(classifyHttpError(401)).toBeNull()
  })
})

describe('handleBack', () => {
  it('goes back in the website when it can', () => {
    const goBack = jest.fn()
    expect(handleBack(true, goBack)).toBe(true)
    expect(goBack).toHaveBeenCalled()
  })

  it('lets the system leave the app on the first page', () => {
    const goBack = jest.fn()
    expect(handleBack(false, goBack)).toBe(false)
    expect(goBack).not.toHaveBeenCalled()
  })
})
