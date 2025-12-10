import { beforeEach, describe, expect, it } from 'vitest'
import { AkashWallet, AkashWalletConfig } from '../../src/akash/wallet'

/**
 * Integration tests for Akash wallet with real testnet RPC.
 *
 * SETUP REQUIRED:
 * 1. Get testnet tokens from faucet: https://faucet.testnet-02.aksh.pw
 * 2. Set environment variable: AKASH_TEST_MNEMONIC (24-word phrase with testnet tokens)
 * 3. Run tests: pnpm test test/akash/wallet-integration.test.ts
 *
 * SKIP BY DEFAULT:
 * These tests are skipped by default because they:
 * - Require real network access (Akash testnet RPC)
 * - Require testnet AKT tokens
 * - May be slow (network latency)
 *
 * To run these tests, remove `.skip` from describe() below.
 */

describe.skip('AkashWallet - Integration Tests (Testnet)', () => {
  let testnetConfig: AkashWalletConfig
  let testMnemonic: string

  beforeEach(() => {
    testnetConfig = {
      rpcEndpoint: 'https://rpc.testnet-02.aksh.pw:443',
      rpcFallbacks: ['https://testnet-rpc.akash.forbole.com:443'],
      chainId: 'testnet-02',
      prefix: 'akash',
      gasPrice: '0.025uakt',
    }

    // Use environment variable or known test mnemonic (NO REAL FUNDS)
    testMnemonic =
      process.env.AKASH_TEST_MNEMONIC ||
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
  })

  describe('RPC Connection', () => {
    it('should connect to Akash testnet RPC', async () => {
      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        testnetConfig,
        'password',
      )

      const address = await wallet.getAddress()
      expect(address).toMatch(/^akash1[a-z0-9]{38}$/)
    }, 60000)

    it('should handle RPC connection with fallbacks', async () => {
      // Set primary endpoint to invalid URL to test fallback
      const configWithBadPrimary = {
        ...testnetConfig,
        rpcEndpoint: 'https://invalid.example.com:443',
      }

      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        configWithBadPrimary,
        'password',
      )

      const address = await wallet.getAddress()
      expect(address).toMatch(/^akash1[a-z0-9]{38}$/)
    }, 60000)
  })

  describe('Balance Query', () => {
    it('should query balance from Akash testnet', async () => {
      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        testnetConfig,
        'password',
      )

      const balance = await wallet.getBalance()

      // Balance should be an array (may be empty if no tokens)
      expect(Array.isArray(balance)).toBe(true)

      // If balance exists, should have uakt
      if (balance.length > 0) {
        expect(
          balance.some((coin) => coin.denom === 'uakt'),
        ).toBe(true)

        const uaktBalance = balance.find((coin) => coin.denom === 'uakt')
        if (uaktBalance) {
          expect(uaktBalance.amount).toMatch(/^\d+$/) // Numeric string
          console.log(`Testnet balance: ${uaktBalance.amount} uakt`)
        }
      } else {
        console.warn('Warning: Test wallet has zero balance. Fund from faucet.')
      }
    }, 60000)
  })

  describe('Token Transfer', () => {
    it.skip('should send tokens on testnet', async () => {
      // SKIP BY DEFAULT: Requires testnet tokens and consumes gas
      // To run: Remove .skip and fund test wallet with testnet tokens

      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        testnetConfig,
        'password',
      )

      // Send to known test recipient (or back to self)
      const recipientAddress = await wallet.getAddress() // Send to self
      const amount = '1000' // 1000 uakt (0.001 AKT)

      const txHash = await wallet.sendTokens(
        recipientAddress,
        amount,
        'password',
        'Integration test transaction',
      )

      expect(txHash).toMatch(/^[A-F0-9]{64}$/i) // Valid tx hash
      console.log(`Transaction hash: ${txHash}`)
    }, 120000)

    it('should fail to send tokens with insufficient balance', async () => {
      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        testnetConfig,
        'password',
      )

      const recipientAddress = await wallet.getAddress()
      const hugeAmount = '999999999999999' // Impossibly large amount

      await expect(
        wallet.sendTokens(recipientAddress, hugeAmount, 'password', 'test'),
      ).rejects.toThrow()
    }, 60000)
  })

  describe('Escrow Balance Query', () => {
    it('should throw not implemented error for escrow query', async () => {
      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        testnetConfig,
        'password',
      )

      await expect(wallet.queryEscrowBalance('12345/1/1')).rejects.toThrow(
        'Escrow query not implemented',
      )
    }, 30000)
  })

  describe('Mainnet RPC Connection', () => {
    it.skip('should connect to Akash mainnet RPC', async () => {
      // SKIP BY DEFAULT: Uses mainnet RPC
      // To run: Remove .skip

      const mainnetConfig: AkashWalletConfig = {
        rpcEndpoint: 'https://rpc.akash.forbole.com:443',
        rpcFallbacks: ['https://akash-rpc.polkachu.com:443'],
        chainId: 'akashnet-2',
        prefix: 'akash',
        gasPrice: '0.025uakt',
      }

      const wallet = await AkashWallet.fromMnemonic(
        testMnemonic,
        mainnetConfig,
        'password',
      )

      const address = await wallet.getAddress()
      expect(address).toMatch(/^akash1[a-z0-9]{38}$/)

      const balance = await wallet.getBalance()
      expect(Array.isArray(balance)).toBe(true)

      console.log('Mainnet connection successful')
    }, 60000)
  })
})
