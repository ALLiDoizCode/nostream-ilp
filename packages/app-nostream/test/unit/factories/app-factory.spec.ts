import { App } from '../../../src/app/app'
import { appFactory } from '../../../src/factories/app-factory'
import { expect } from 'chai'

describe('appFactory', () => {
  it('returns an App', () => {
    expect(appFactory()).to.be.an.instanceOf(App)
  })
})
