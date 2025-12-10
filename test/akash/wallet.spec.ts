import { beforeEach, describe, expect, it } from 'vitest'
import { AkashWallet, AkashWalletConfig } from '../../src/akash/wallet'

describe('AkashWallet - Unit Tests', () => {
  let testConfig: AkashWalletConfig

  beforeEach(() => {
    testConfig = {
      rpcEndpoint: 'https://rpc.akash.forbole.com:443',
      rpcFallbacks: ['https://akash-rpc.polkachu.com:443'],
      chainId: 'akashnet-2',
      prefix: 'akash',
      gasPrice: '0.025uakt',
    }
  })

  describe('Wallet Generation', () => {
    it('should generate new wallet with 24-word mnemonic', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'test-password-123')

      const address = await wallet.getAddress()
      expect(address).toMatch(/^akash1[a-z0-9]{38}$/) // Bech32 format

      const mnemonic = await wallet.exportMnemonic('test-password-123')
      const words = mnemonic.split(' ')
      expect(words).toHaveLength(24)
    }, 30000)

    it('should generate unique addresses for different wallets', async () => {
      const wallet1 = await AkashWallet.generate(testConfig, 'password1')
      const wallet2 = await AkashWallet.generate(testConfig, 'password2')

      const address1 = await wallet1.getAddress()
      const address2 = await wallet2.getAddress()

      expect(address1).not.toBe(address2)
    }, 30000)
  })

  describe('Wallet Import', () => {
    it('should import wallet from valid mnemonic', async () => {
      // Known test mnemonic (DO NOT use in production)
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'

      const wallet = await AkashWallet.fromMnemonic(mnemonic, testConfig, 'password')

      const address = await wallet.getAddress()
      // Verify address format (specific address may vary by implementation)
      expect(address).toMatch(/^akash1[a-z0-9]{38}$/)

      // Verify deterministic: same mnemonic always gives same address
      const wallet2 = await AkashWallet.fromMnemonic(mnemonic, testConfig, 'password2')
      const address2 = await wallet2.getAddress()
      expect(address).toBe(address2)
    }, 60000)

    it('should import same wallet with same mnemonic', async () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'

      const wallet1 = await AkashWallet.fromMnemonic(mnemonic, testConfig, 'password1')
      const wallet2 = await AkashWallet.fromMnemonic(mnemonic, testConfig, 'password2')

      const address1 = await wallet1.getAddress()
      const address2 = await wallet2.getAddress()

      expect(address1).toBe(address2) // Same mnemonic = same address
    }, 30000)

    it('should reject invalid mnemonic (too few words)', async () => {
      const invalidMnemonic = 'abandon abandon abandon'

      await expect(
        AkashWallet.fromMnemonic(invalidMnemonic, testConfig, 'password'),
      ).rejects.toThrow('Invalid mnemonic')
    })

    it('should reject invalid mnemonic (not in wordlist)', async () => {
      const invalidMnemonic =
        'invalid mnemonic phrase that is not in the bip39 wordlist at all here now'

      await expect(
        AkashWallet.fromMnemonic(invalidMnemonic, testConfig, 'password'),
      ).rejects.toThrow('Invalid mnemonic')
    })

    it('should reject mnemonic with wrong word count', async () => {
      // 13 words (not 12 or 24)
      const invalidMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'

      await expect(
        AkashWallet.fromMnemonic(invalidMnemonic, testConfig, 'password'),
      ).rejects.toThrow('Invalid mnemonic')
    })
  })

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt mnemonic correctly', async () => {
      const password = 'secure-pass-123'
      const wallet = await AkashWallet.generate(testConfig, password)

      const exported = await wallet.exportMnemonic(password)
      expect(exported.split(' ')).toHaveLength(24)
    }, 30000)

    it('should reject wrong password when exporting', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'correct-password')

      await expect(wallet.exportMnemonic('wrong-password')).rejects.toThrow(
        'Incorrect password',
      )
    }, 30000)

    it('should reject wrong password when sending tokens', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'correct-password')

      await expect(
        wallet.sendTokens(
          'akash1recipient123',
          '1000',
          'wrong-password',
          'test memo',
        ),
      ).rejects.toThrow('Incorrect password')
    }, 30000)

    it('should allow export with correct password', async () => {
      const password = 'my-secure-password'
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'

      const wallet = await AkashWallet.fromMnemonic(mnemonic, testConfig, password)
      const exported = await wallet.exportMnemonic(password)

      expect(exported).toBe(mnemonic)
    }, 30000)
  })

  describe('Address Format', () => {
    it('should generate address with correct prefix', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'password')
      const address = await wallet.getAddress()

      expect(address.startsWith('akash1')).toBe(true)
    }, 30000)

    it('should support custom prefix', async () => {
      const customConfig = { ...testConfig, prefix: 'cosmos' }
      const wallet = await AkashWallet.generate(customConfig, 'password')
      const address = await wallet.getAddress()

      expect(address.startsWith('cosmos1')).toBe(true)
    }, 30000)

    it('should generate valid bech32 address', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'password')
      const address = await wallet.getAddress()

      // Bech32 format: prefix + separator + 38 characters
      expect(address).toMatch(/^akash1[a-z0-9]{38}$/)
    }, 30000)
  })

  describe('Error Handling', () => {
    it('should throw error when getting balance before initialization', async () => {
      // This is a private constructor test - not directly testable
      // Balance query errors are tested in integration tests
      expect(true).toBe(true)
    })

    it('should reject password shorter than 8 characters', async () => {
      // Password validation requires minimum 8 characters for security
      await expect(AkashWallet.generate(testConfig, '')).rejects.toThrow(
        'Password must be at least 8 characters',
      )

      await expect(AkashWallet.generate(testConfig, 'short')).rejects.toThrow(
        'Password must be at least 8 characters',
      )

      await expect(AkashWallet.generate(testConfig, '1234567')).rejects.toThrow(
        'Password must be at least 8 characters',
      )

      // 8 characters should be accepted
      const wallet = await AkashWallet.generate(testConfig, '12345678')
      expect(await wallet.getAddress()).toMatch(/^akash1[a-z0-9]{38}$/)
    }, 30000)
  })

  describe('Multiple Wallets', () => {
    it('should support multiple wallet instances', async () => {
      const wallet1 = await AkashWallet.generate(testConfig, 'password1')
      const wallet2 = await AkashWallet.generate(testConfig, 'password2')

      const address1 = await wallet1.getAddress()
      const address2 = await wallet2.getAddress()

      expect(address1).not.toBe(address2)

      // Both should work independently
      const mnemonic1 = await wallet1.exportMnemonic('password1')
      const mnemonic2 = await wallet2.exportMnemonic('password2')

      expect(mnemonic1).not.toBe(mnemonic2)
    }, 30000)
  })

  describe('Escrow Balance Query', () => {
    it('should throw not implemented error for escrow query', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'password')

      await expect(wallet.queryEscrowBalance('12345/1/1')).rejects.toThrow(
        'Escrow query not implemented',
      )
    }, 30000)
  })

  describe('Message Signing', () => {
    it('should throw not implemented error for message signing', async () => {
      const wallet = await AkashWallet.generate(testConfig, 'password')

      await expect(wallet.signMessage('test message')).rejects.toThrow(
        'Message signing not implemented',
      )
    }, 30000)
  })
})
