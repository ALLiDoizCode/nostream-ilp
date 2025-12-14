import { AppWorker } from '../../../src/app/worker'
import { workerFactory } from '../../../src/factories/worker-factory'
import { SettingsStatic } from '../../../src/utils/settings'
import { expect } from 'chai'
import Sinon from 'sinon'
import { vi } from 'vitest'

vi.mock('../../../src/database/client', () => ({
  getMasterDbClient: vi.fn(() => ({})),
  getReadReplicaDbClient: vi.fn(() => ({})),
}))

vi.mock('../../../src/cache/client', () => ({
  getCacheClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn(),
  })),
}))

vi.mock('../../../src/factories/dassie-client-factory', () => ({
  initializeDassieClient: vi.fn(() => Promise.resolve()),
  getDassieClient: vi.fn(() => ({})),
}))

describe('workerFactory', () => {
  let createSettingsStub: Sinon.SinonStub

  beforeEach(() => {
    createSettingsStub = Sinon.stub(SettingsStatic, 'createSettings')
  })

  afterEach(() => {
    createSettingsStub.restore()
    vi.clearAllMocks()
  })

  it('returns an AppWorker', () => {
    createSettingsStub.returns({
      info: {
        relay_url: 'url',
      },
      network: {

      },
    })

    const worker = workerFactory()
    expect(worker).to.be.an.instanceOf(AppWorker)
    worker.close()
  })
})
