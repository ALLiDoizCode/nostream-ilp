import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { CronosPaymentChannel, MockAKT } from '../typechain-types'

// Test constants
const ALICE_INITIAL_BALANCE = ethers.parseUnits('10000', 6) // 10k AKT
const BOB_INITIAL_BALANCE = ethers.parseUnits('1000', 6)    // 1k AKT

describe('CronosPaymentChannel', function () {
  let paymentChannel: CronosPaymentChannel
  let aktToken: MockAKT
  let alice: SignerWithAddress
  let bob: SignerWithAddress

  beforeEach(async function () {
    const signers = await ethers.getSigners()
    alice = signers[1]
    bob = signers[2]

    // Deploy MockAKT token
    const Token = await ethers.getContractFactory('MockAKT')
    aktToken = await Token.deploy()

    // Mint test AKT to alice and bob
    await aktToken.mint(alice.address, ALICE_INITIAL_BALANCE)
    await aktToken.mint(bob.address, BOB_INITIAL_BALANCE)

    // Deploy CronosPaymentChannel with MockAKT address
    const PaymentChannel = await ethers.getContractFactory('CronosPaymentChannel')
    paymentChannel = await PaymentChannel.deploy(await aktToken.getAddress())
  })

  describe('Deployment', function () {
    it('should set correct AKT token address', async function () {
      expect(await paymentChannel.aktToken()).to.equal(await aktToken.getAddress())
    })
  })

  describe('openChannel', function () {
    it('should successfully open a channel with valid AKT amount', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600 // 1 hour from now
      const amount = ethers.parseUnits('100', 6) // 100 AKT

      // Approve contract to spend alice's AKT
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)

      // Open channel
      const tx = await paymentChannel.connect(alice).openChannel(recipient, expiration, amount)
      const receipt = await tx.wait()

      // Verify ChannelOpened event
      const event = receipt?.logs.find(
        (log: any) => log.fragment && log.fragment.name === 'ChannelOpened'
      )
      expect(event).to.not.be.undefined

      // Verify contract received AKT
      expect(await aktToken.balanceOf(await paymentChannel.getAddress())).to.equal(amount)

      // Get channelId from event
      const channelId = (event as any).args.channelId

      // Verify channel state
      const channel = await paymentChannel.getChannel(channelId)
      expect(channel.sender).to.equal(alice.address)
      expect(channel.recipient).to.equal(recipient)
      expect(channel.balance).to.equal(amount)
      expect(channel.expiration).to.equal(expiration)
      expect(channel.isClosed).to.be.false
      expect(channel.highestNonce).to.equal(0)
    })

    it('should revert if amount is zero', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = 0

      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)

      await expect(
        paymentChannel.connect(alice).openChannel(recipient, expiration, amount)
      ).to.be.revertedWithCustomError(paymentChannel, 'InsufficientBalance')
    })

    it('should revert if recipient is zero address', async function () {
      const recipient = ethers.ZeroAddress
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)

      await expect(
        paymentChannel.connect(alice).openChannel(recipient, expiration, amount)
      ).to.be.revertedWithCustomError(paymentChannel, 'InvalidRecipient')
    })

    it('should revert if expiration is in the past', async function () {
      const recipient = bob.address
      const now = await time.latest()
      const expiration = now - 1 // Past timestamp
      const amount = ethers.parseUnits('100', 6)

      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)

      await expect(
        paymentChannel.connect(alice).openChannel(recipient, expiration, amount)
      ).to.be.revertedWithCustomError(paymentChannel, 'ChannelExpired')
    })

    it('should generate unique channel IDs for different channels', async function () {
      const recipient = bob.address
      const amount = ethers.parseUnits('100', 6)

      // Open first channel
      const expiration1 = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const tx1 = await paymentChannel.connect(alice).openChannel(recipient, expiration1, amount)
      const receipt1 = await tx1.wait()
      const event1 = receipt1?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId1 = (event1 as any).args.channelId

      // Advance time slightly
      await time.increase(1)

      // Open second channel
      const expiration2 = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const tx2 = await paymentChannel.connect(alice).openChannel(recipient, expiration2, amount)
      const receipt2 = await tx2.wait()
      const event2 = receipt2?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId2 = (event2 as any).args.channelId

      // Verify IDs are unique
      expect(channelId1).to.not.equal(channelId2)
    })
  })

  describe('closeChannel', function () {
    /**
     * Helper function to sign a payment claim
     * @param channelId Channel identifier
     * @param claimAmount Amount being claimed
     * @param nonce Monotonically increasing nonce
     * @param signer Signer (channel sender)
     * @returns Signature bytes
     */
    async function signClaim(
      channelId: string,
      claimAmount: bigint,
      nonce: number,
      signer: SignerWithAddress
    ): Promise<string> {
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256'],
        [channelId, claimAmount, nonce]
      )
      const signature = await signer.signMessage(ethers.getBytes(messageHash))
      return signature
    }

    it('should close channel with valid claim and transfer AKT to recipient', async function () {
      // Open channel: alice → bob, 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Create claim for 60 AKT
      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      // Record balances before close
      const aliceBalanceBefore = await aktToken.balanceOf(alice.address)
      const bobBalanceBefore = await aktToken.balanceOf(bob.address)

      // Close channel
      const closeTx = await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)
      const closeReceipt = await closeTx.wait()

      // Verify ChannelClosed event
      const closeEvent = closeReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelClosed')
      expect(closeEvent).to.not.be.undefined

      // Verify bob received claim amount
      expect(await aktToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claimAmount)

      // Verify alice received refund (100 - 60 = 40 AKT)
      const refundAmount = amount - claimAmount
      expect(await aktToken.balanceOf(alice.address)).to.equal(aliceBalanceBefore + refundAmount)

      // Verify channel is closed
      const channel = await paymentChannel.getChannel(channelId)
      expect(channel.isClosed).to.be.true
    })

    it('should close channel with full claim amount', async function () {
      // Open channel: alice → bob, 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Create claim for full 100 AKT
      const claimAmount = amount
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      // Record balances
      const aliceBalanceBefore = await aktToken.balanceOf(alice.address)
      const bobBalanceBefore = await aktToken.balanceOf(bob.address)

      // Close channel
      await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)

      // Verify bob received full amount
      expect(await aktToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claimAmount)

      // Verify alice received 0 refund
      expect(await aktToken.balanceOf(alice.address)).to.equal(aliceBalanceBefore)
    })

    it('should revert if claim exceeds channel balance', async function () {
      // Open channel: alice → bob, 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Attempt to claim 150 AKT (more than balance)
      const claimAmount = ethers.parseUnits('150', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      await expect(
        paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)
      ).to.be.revertedWithCustomError(paymentChannel, 'InsufficientBalance')
    })

    it('should revert if nonce is not monotonically increasing', async function () {
      // Open channel: alice → bob, 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Close with nonce 5
      const claimAmount1 = ethers.parseUnits('30', 6)
      const nonce1 = 5
      const signature1 = await signClaim(channelId, claimAmount1, nonce1, alice)
      await paymentChannel.connect(bob).closeChannel(channelId, claimAmount1, nonce1, signature1)

      // Attempt to close again with lower nonce 3
      const claimAmount2 = ethers.parseUnits('40', 6)
      const nonce2 = 3
      const signature2 = await signClaim(channelId, claimAmount2, nonce2, alice)

      await expect(
        paymentChannel.connect(bob).closeChannel(channelId, claimAmount2, nonce2, signature2)
      ).to.be.revertedWithCustomError(paymentChannel, 'ChannelAlreadyClosed')
    })

    it('should revert if signature is invalid', async function () {
      // Open channel: alice → bob, 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Create claim signed by bob (wrong signer, should be alice)
      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, bob) // Wrong signer!

      await expect(
        paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)
      ).to.be.revertedWithCustomError(paymentChannel, 'InvalidSignature')
    })

    it('should revert if channel is already closed', async function () {
      // Open channel: alice → bob, 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Close channel
      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)
      await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)

      // Attempt to close again
      const claimAmount2 = ethers.parseUnits('70', 6)
      const nonce2 = 2
      const signature2 = await signClaim(channelId, claimAmount2, nonce2, alice)

      await expect(
        paymentChannel.connect(bob).closeChannel(channelId, claimAmount2, nonce2, signature2)
      ).to.be.revertedWithCustomError(paymentChannel, 'ChannelAlreadyClosed')
    })

    it('should revert if channel is expired', async function () {
      // Open channel with short expiration
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 10 // Expires in 10 seconds
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Fast-forward time past expiration
      await time.increase(11)

      // Attempt to close expired channel
      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      await expect(
        paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)
      ).to.be.revertedWithCustomError(paymentChannel, 'ChannelExpired')
    })
  })

  describe('expireChannel', function () {
    it('should refund sender when channel expires', async function () {
      // Open channel with 100 AKT, expiration in 1 hour
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Fast-forward time past expiration
      await time.increase(3601)

      // Record alice balance before expiration
      const aliceBalanceBefore = await aktToken.balanceOf(alice.address)

      // Expire channel
      await paymentChannel.expireChannel(channelId)

      // Verify alice receives full refund
      expect(await aktToken.balanceOf(alice.address)).to.equal(aliceBalanceBefore + amount)

      // Verify channel is closed
      const channel = await paymentChannel.getChannel(channelId)
      expect(channel.isClosed).to.be.true
    })

    it('should revert if channel is not expired yet', async function () {
      // Open channel with expiration in 1 hour
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Attempt to expire immediately (before expiration time)
      await expect(
        paymentChannel.expireChannel(channelId)
      ).to.be.revertedWithCustomError(paymentChannel, 'ChannelNotExpired')
    })

    it('should revert if channel is already closed', async function () {
      // Open channel
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Close channel normally
      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256'],
        [channelId, claimAmount, nonce]
      )
      const signature = await alice.signMessage(ethers.getBytes(messageHash))
      await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)

      // Fast-forward time past expiration
      await time.increase(3601)

      // Attempt to expire already closed channel
      await expect(
        paymentChannel.expireChannel(channelId)
      ).to.be.revertedWithCustomError(paymentChannel, 'ChannelAlreadyClosed')
    })
  })

  describe('ERC-20 Approval Flow', function () {
    it('should revert if insufficient approval', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      // Approve only 50 AKT but try to open channel with 100 AKT
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), ethers.parseUnits('50', 6))

      await expect(
        paymentChannel.connect(alice).openChannel(recipient, expiration, amount)
      ).to.be.reverted // ERC20: insufficient allowance
    })

    it('should revert if insufficient token balance', async function () {
      // Create new account with no tokens
      const [, , , charlie] = await ethers.getSigners()

      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      // Charlie has 0 AKT, approve 100 AKT
      await aktToken.connect(charlie).approve(await paymentChannel.getAddress(), amount)

      await expect(
        paymentChannel.connect(charlie).openChannel(recipient, expiration, amount)
      ).to.be.reverted // ERC20: transfer amount exceeds balance
    })

    it('should allow opening channel after increasing approval', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      // First approve only 50 AKT
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), ethers.parseUnits('50', 6))

      // Increase approval to 100 AKT
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)

      // Should now succeed
      const tx = await paymentChannel.connect(alice).openChannel(recipient, expiration, amount)
      const receipt = await tx.wait()
      const event = receipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      expect(event).to.not.be.undefined
    })

    it('should handle multiple channels with same sender', async function () {
      const recipient = bob.address
      const amount1 = ethers.parseUnits('100', 6)
      const amount2 = ethers.parseUnits('50', 6)

      // Open channel 1: alice → bob (100 AKT)
      const expiration1 = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount1)
      const tx1 = await paymentChannel.connect(alice).openChannel(recipient, expiration1, amount1)
      const receipt1 = await tx1.wait()
      const event1 = receipt1?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId1 = (event1 as any).args.channelId

      // Advance time slightly
      await time.increase(1)

      // Open channel 2: alice → bob (50 AKT)
      const expiration2 = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount2)
      const tx2 = await paymentChannel.connect(alice).openChannel(recipient, expiration2, amount2)
      const receipt2 = await tx2.wait()
      const event2 = receipt2?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId2 = (event2 as any).args.channelId

      // Verify both channels exist independently
      const channel1 = await paymentChannel.getChannel(channelId1)
      const channel2 = await paymentChannel.getChannel(channelId2)
      expect(channel1.balance).to.equal(amount1)
      expect(channel2.balance).to.equal(amount2)
      expect(channel1.isClosed).to.be.false
      expect(channel2.isClosed).to.be.false

      // Close both channels
      const aliceBalanceBefore = await aktToken.balanceOf(alice.address)
      const bobBalanceBefore = await aktToken.balanceOf(bob.address)

      // Close channel 1 with 60 AKT claim
      const claim1 = ethers.parseUnits('60', 6)
      const messageHash1 = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256'],
        [channelId1, claim1, 1]
      )
      const signature1 = await alice.signMessage(ethers.getBytes(messageHash1))
      await paymentChannel.connect(bob).closeChannel(channelId1, claim1, 1, signature1)

      // Close channel 2 with 30 AKT claim
      const claim2 = ethers.parseUnits('30', 6)
      const messageHash2 = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256'],
        [channelId2, claim2, 1]
      )
      const signature2 = await alice.signMessage(ethers.getBytes(messageHash2))
      await paymentChannel.connect(bob).closeChannel(channelId2, claim2, 1, signature2)

      // Verify correct balances
      // Bob should receive: 60 + 30 = 90 AKT
      // Alice should receive refund: (100 - 60) + (50 - 30) = 40 + 20 = 60 AKT
      expect(await aktToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claim1 + claim2)
      expect(await aktToken.balanceOf(alice.address)).to.equal(
        aliceBalanceBefore + (amount1 - claim1) + (amount2 - claim2)
      )
    })

    it('should handle zero refund case (full claim)', async function () {
      // Open channel with 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Record balances
      const aliceBalanceBefore = await aktToken.balanceOf(alice.address)
      const bobBalanceBefore = await aktToken.balanceOf(bob.address)

      // Close with claim for exactly 100 AKT (full amount)
      const claimAmount = amount
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256'],
        [channelId, claimAmount, 1]
      )
      const signature = await alice.signMessage(ethers.getBytes(messageHash))
      await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, 1, signature)

      // Verify bob received full amount
      expect(await aktToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claimAmount)

      // Verify alice received 0 refund (no revert on 0 amount transfer)
      expect(await aktToken.balanceOf(alice.address)).to.equal(aliceBalanceBefore)
    })
  })

  describe('View Functions', function () {
    it('getChannel() should return correct channel state', async function () {
      // Open channel
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Query channel state
      const channel = await paymentChannel.getChannel(channelId)

      // Verify all fields
      expect(channel.sender).to.equal(alice.address)
      expect(channel.recipient).to.equal(bob.address)
      expect(channel.balance).to.equal(amount)
      expect(channel.highestNonce).to.equal(0)
      expect(channel.expiration).to.equal(expiration)
      expect(channel.isClosed).to.be.false
    })

    it('isChannelOpen() should return true for open channels', async function () {
      // Open channel
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Verify channel is open
      expect(await paymentChannel.isChannelOpen(channelId)).to.be.true
    })

    it('isChannelOpen() should return false for closed channels', async function () {
      // Open channel
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Close channel
      const claimAmount = ethers.parseUnits('60', 6)
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256'],
        [channelId, claimAmount, 1]
      )
      const signature = await alice.signMessage(ethers.getBytes(messageHash))
      await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, 1, signature)

      // Verify channel is closed
      expect(await paymentChannel.isChannelOpen(channelId)).to.be.false
    })

    it('getChannelBalance() should return correct balance', async function () {
      // Open channel with 100 AKT
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600
      await aktToken.connect(alice).approve(await paymentChannel.getAddress(), amount)
      const openTx = await paymentChannel.connect(alice).openChannel(bob.address, expiration, amount)
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Verify balance
      expect(await paymentChannel.getChannelBalance(channelId)).to.equal(amount)
    })

    it('aktToken() should return correct token address', async function () {
      expect(await paymentChannel.aktToken()).to.equal(await aktToken.getAddress())
    })
  })

  describe('generateChannelId', function () {
    it('should generate deterministic channel ID', async function () {
      const sender = alice.address
      const recipient = bob.address
      const timestamp = await time.latest()

      // Generate ID twice with same parameters
      const id1 = await paymentChannel.generateChannelId(sender, recipient, timestamp)
      const id2 = await paymentChannel.generateChannelId(sender, recipient, timestamp)

      // Verify both IDs are identical
      expect(id1).to.equal(id2)
    })

    it('should generate different IDs for different timestamps', async function () {
      const sender = alice.address
      const recipient = bob.address
      const timestamp1 = await time.latest()
      const timestamp2 = timestamp1 + 1

      // Generate ID1 at timestamp T
      const id1 = await paymentChannel.generateChannelId(sender, recipient, timestamp1)

      // Generate ID2 at timestamp T+1
      const id2 = await paymentChannel.generateChannelId(sender, recipient, timestamp2)

      // Verify IDs are different
      expect(id1).to.not.equal(id2)
    })

    it('should generate different IDs for different senders', async function () {
      const recipient = bob.address
      const timestamp = await time.latest()

      // Generate ID with alice as sender
      const id1 = await paymentChannel.generateChannelId(alice.address, recipient, timestamp)

      // Generate ID with bob as sender
      const id2 = await paymentChannel.generateChannelId(bob.address, recipient, timestamp)

      // Verify IDs are different
      expect(id1).to.not.equal(id2)
    })
  })
})
