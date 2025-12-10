import { GetInvoiceStatusController } from '../../controllers/invoices/get-invoice-status-controller'
import { InvoiceRepository } from '../../repositories/invoice-repository'
import { getReadReplicaDbClient } from '../../database/client'

export const createGetInvoiceStatusController = () => {
  const rrDbClient = getReadReplicaDbClient()

  const invoiceRepository = new InvoiceRepository(rrDbClient)

  return new GetInvoiceStatusController(invoiceRepository)
}
