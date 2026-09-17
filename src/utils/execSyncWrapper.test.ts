import { describe, expect, test } from 'bun:test'
import { buildExecSyncOptions } from './execSyncWrapper.js'

describe('execSync Windows console handling', () => {
  test('hides helper console windows by default', () => {
    expect(buildExecSyncOptions({ stdio: 'pipe' })).toEqual({
      stdio: 'pipe',
      windowsHide: true,
    })
  })

  test('allows explicitly visible commands such as external editors', () => {
    expect(buildExecSyncOptions({ windowsHide: false })).toEqual({
      windowsHide: false,
    })
  })
})
