import { pubkeySchema } from './base-schema'
import Schema from 'joi'

export const generateInvoiceSchema = Schema.object({
  pubkey: pubkeySchema.required(),
  tosAccepted: Schema.valid('yes').required(),
}).unknown(false)
