import { getMasterDbClient, getReadReplicaDbClient } from '../database/client'
import { StaticMirroringWorker } from '../app/static-mirroring-worker'
import { EventRepository } from '../repositories/event-repository'
import { UserRepository } from '../repositories/user-repository'
import { createSettings } from './settings-factory'

export const staticMirroringWorkerFactory = () => {
  const dbClient = getMasterDbClient()
  const readReplicaDbClient = getReadReplicaDbClient()
  const eventRepository = new EventRepository(dbClient, readReplicaDbClient)
  const userRepository = new UserRepository(dbClient)

  return new StaticMirroringWorker(
    eventRepository,
    userRepository,
    process,
    createSettings,
  )
}
