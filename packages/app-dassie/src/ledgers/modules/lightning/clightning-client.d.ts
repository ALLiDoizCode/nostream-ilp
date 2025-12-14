/**
 * Type declarations for \@asoltys/clightning-client
 *
 * This is a minimal type definition for the Core Lightning client.
 * Only includes methods used by the Lightning settlement module.
 */
declare module "@asoltys/clightning-client" {
  export default class LightningClient {
    constructor(socketPath: string)

    getinfo(): Promise<{
      id: string
      alias: string
      color: string
      num_peers: number
      num_active_channels: number
      num_pending_channels: number
      blockheight: number
      network: string
      [key: string]: unknown
    }>

    fundchannel(parameters: {
      id: string
      amount: string
      announce?: boolean
    }): Promise<{
      txid: string
      [key: string]: unknown
    }>

    close(parameters: {
      id: string
      unilateraltimeout?: number
    }): Promise<{
      txid?: string
      [key: string]: unknown
    }>

    pay(parameters: {
      bolt11: string
      amount_msat?: string
    }): Promise<{
      payment_preimage: string
      payment_hash: string
      amount_sent_msat: number
      amount_msat: number
      [key: string]: unknown
    }>

    invoice(parameters: {
      amount_msat: string
      label: string
      description: string
      expiry?: number
    }): Promise<{
      bolt11: string
      payment_hash: string
      payment_secret: string
      expires_at: number
      [key: string]: unknown
    }>

    listfunds(): Promise<{
      channels: Array<{
        funding_txid: string
        short_channel_id?: string
        peer_id: string
        amount_msat: number
        our_amount_msat: number
        state: string
        [key: string]: unknown
      }>
      [key: string]: unknown
    }>

    connect(parameters: {
      id: string
      host?: string
    }): Promise<{
      id: string
      [key: string]: unknown
    }>
  }
}
