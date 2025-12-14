import { NextFunction, Request, Response } from 'express'
import { FeeSchedule } from '../../@types/settings'
import { createSettings } from '../../factories/settings-factory'
import { pricingConfig } from '../../services/payment/pricing-config'
import { fromBech32 } from '../../utils/transform'
import { path } from 'ramda'
import packageJson from '../../../package.json'

export const rootRequestHandler = (request: Request, response: Response, next: NextFunction) => {
  const settings = createSettings()

  if (request.header('accept') === 'application/nostr+json') {
    const {
      info: { name, description, pubkey: rawPubkey, contact, relay_url },
    } = settings

    const paymentsUrl = new URL(relay_url)
    paymentsUrl.protocol = paymentsUrl.protocol === 'wss:' ? 'https:' : 'http:'
    paymentsUrl.pathname = '/invoices'

    const content = settings.limits?.event?.content

    const pubkey = rawPubkey.startsWith('npub1')
      ? fromBech32(rawPubkey)
      : rawPubkey

    const relayInformationDocument = {
      name,
      description,
      pubkey,
      contact,
      supported_nips: packageJson.supportedNips,
      supported_nip_extensions: packageJson.supportedNipExtensions,
      software: packageJson.repository.url,
      version: packageJson.version,
      limitation: {
            max_message_length: settings.network.maxPayloadSize,
            max_subscriptions: settings.limits?.client?.subscription?.maxSubscriptions,
            max_filters: settings.limits?.client?.subscription?.maxFilterValues,
            max_limit: settings.limits?.client?.subscription?.maxLimit,
            max_subid_length: settings.limits?.client?.subscription?.maxSubscriptionIdLength,
            min_prefix: settings.limits?.client?.subscription?.minPrefixLength,
            max_event_tags: 2500,
            max_content_length: Array.isArray(content)
              ? content[0].maxLength // best guess since we have per-kind limits
              : content?.maxLength,
            min_pow_difficulty: settings.limits?.event?.eventId?.minLeadingZeroBits,
            auth_required: false,
            payment_required: settings.payments?.enabled,
      },
      payments_url: paymentsUrl.toString(),
      fees: (() => {
        // Start with existing fee schedules from settings
        const existingFees = Object
          .getOwnPropertyNames(settings.payments.feeSchedules)
          .reduce((prev, feeName) => {
            const feeSchedules = settings.payments.feeSchedules[feeName] as FeeSchedule[]

            return {
              ...prev,
              [feeName]: feeSchedules.reduce((fees, fee) => (fee.enabled)
                ? [...fees, { amount: fee.amount, unit: 'msats' }]
                : fees, []),
            }

          }, {} as Record<string, { amount: number, unit: string }[]>)

        // Add pricing configuration from environment variables (Story 1.5)
        const pricingFees: Record<string, { amount: number, unit: string, kinds?: number[] }[]> = {
          admission: [
            { amount: Number(pricingConfig.storeEvent), unit: 'sat' },
          ],
          publication: [
            { amount: Number(pricingConfig.storeEvent), unit: 'sat' },
          ],
          subscription: [
            { amount: Number(pricingConfig.query), unit: 'sat' },
          ],
        }

        // Add per-kind overrides to publication fees
        if (pricingConfig.kindOverrides.size > 0) {
          pricingFees.publication.push(
            ...Array.from(pricingConfig.kindOverrides.entries()).map(([kind, amount]) => ({
              amount: Number(amount),
              unit: 'sat',
              kinds: [kind],
            })),
          )
        }

        // Merge existing fees with pricing config (pricing config takes precedence if both exist)
        return {
          ...existingFees,
          ...pricingFees,
        }
      })(),
    }

    response
      .setHeader('content-type', 'application/nostr+json')
      .setHeader('access-control-allow-origin', '*')
      .status(200)
      .send(relayInformationDocument)

    return
  }

  const admissionFeeEnabled = path(['payments','feeSchedules','admission', '0', 'enabled'])(settings)

  if (admissionFeeEnabled) {
    response.redirect(301, '/invoices')
  } else {
    response.status(200).setHeader('content-type', 'text/plain; charset=utf8').send('Please use a Nostr client to connect.')
  }
  next()
}
