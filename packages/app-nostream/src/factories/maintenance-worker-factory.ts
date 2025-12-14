import { MaintenanceWorker } from '../app/maintenance-worker'
import { createPaymentsService } from './payments-service-factory'
import { createSettings } from './settings-factory'

export const maintenanceWorkerFactory = () => {
  return new MaintenanceWorker(process, createPaymentsService(), createSettings)
}
