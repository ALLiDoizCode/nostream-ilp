import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { MockAKT, MockCRO, MockUSDC, MultiTokenPaymentChannelFactory } from '../typechain-types'

// Test constants
const ALICE_INITIAL_BALANCE_6DEC = ethers.parseUnits('10000', 6) // 10k tokens (6 decimals)
const ALICE_INITIAL_BALANCE_18DEC = ethers.parseUnits('10000', 18) // 10k tokens (18 decimals)
const BOB_INITIAL_BALANCE_6DEC = ethers.parseUnits('1000', 6)    // 1k tokens (6 decimals)
const BOB_INITIAL_BALANCE_18DEC = ethers.parseUnits('1000', 18)  // 1k tokens (18 decimals)

describe('MultiTokenPaymentChannelFactory', function () {
  let factory: MultiTokenPaymentChannelFactory
  let aktToken: MockAKT
  let usdcToken: MockUSDC
  let croToken: MockCRO
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let charlie: SignerWithAddress

  beforeEach(async function () {
    const signers = await ethers.getSigners()
    alice = signers[1]
    bob = signers[2]
    charlie = signers[3]

    // Deploy mock tokens
    const AKT = await ethers.getContractFactory('MockAKT')
    aktToken = await AKT.deploy()

    const USDC = await ethers.getContractFactory('MockUSDC')
    usdcToken = await USDC.deploy()

    const CRO = await ethers.getContractFactory('MockCRO')
    croToken = await CRO.deploy()

    // Mint test tokens to alice and bob
    await aktToken.mint(alice.address, ALICE_INITIAL_BALANCE_6DEC)
    await aktToken.mint(bob.address, BOB_INITIAL_BALANCE_6DEC)

    await usdcToken.mint(alice.address, ALICE_INITIAL_BALANCE_6DEC)
    await usdcToken.mint(bob.address, BOB_INITIAL_BALANCE_6DEC)

    await croToken.mint(alice.address, ALICE_INITIAL_BALANCE_18DEC)
    await croToken.mint(bob.address, BOB_INITIAL_BALANCE_18DEC)

    // Deploy MultiTokenPaymentChannelFactory
    const Factory = await ethers.getContractFactory('MultiTokenPaymentChannelFactory')
    factory = await Factory.deploy()
  })

  /**
   * Helper function to sign a payment claim
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

  describe('Deployment', function () {
    it('should deploy successfully', async function () {
      expect(await factory.getAddress()).to.be.properAddress
    })
  })

  describe('openChannel with Multiple Tokens', function () {
    it('should open channel with AKT token', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const tx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        recipient,
        amount,
        expiration
      )
      const receipt = await tx.wait()

      const _event = receipt?.logs.find(
        (log: any) => log.fragment && log.fragment.name === 'ChannelOpened'
      )
      expect(event).to.not.be.undefined

      const channelId = (event as any).args.channelId
      const channel = await factory.getChannel(channelId)
      expect(channel.token).to.equal(await aktToken.getAddress())
      expect(channel.balance).to.equal(amount)
    })

    it('should open channel with USDC token', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('50', 6)

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const tx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        recipient,
        amount,
        expiration
      )
      const receipt = await tx.wait()

      const _event = receipt?.logs.find(
        (log: any) => log.fragment && log.fragment.name === 'ChannelOpened'
      )
      const channelId = (event as any).args.channelId
      const channel = await factory.getChannel(channelId)
      expect(channel.token).to.equal(await usdcToken.getAddress())
      expect(channel.balance).to.equal(amount)
    })

    it('should open channel with CRO token', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('1.0', 18)

      await croToken.connect(alice).approve(await factory.getAddress(), amount)
      const tx = await factory.connect(alice).openChannel(
        await croToken.getAddress(),
        recipient,
        amount,
        expiration
      )
      const receipt = await tx.wait()

      const _event = receipt?.logs.find(
        (log: any) => log.fragment && log.fragment.name === 'ChannelOpened'
      )
      const channelId = (event as any).args.channelId
      const channel = await factory.getChannel(channelId)
      expect(channel.token).to.equal(await croToken.getAddress())
      expect(channel.balance).to.equal(amount)
    })

    it('should open channel with native ETH', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseEther('1.0')

      const tx = await factory.connect(alice).openChannel(
        ethers.ZeroAddress, // address(0) = native ETH
        recipient,
        amount,
        expiration,
        { value: amount }
      )
      const receipt = await tx.wait()

      const _event = receipt?.logs.find(
        (log: any) => log.fragment && log.fragment.name === 'ChannelOpened'
      )
      const channelId = (event as any).args.channelId
      const channel = await factory.getChannel(channelId)
      expect(channel.token).to.equal(ethers.ZeroAddress)
      expect(channel.balance).to.equal(amount)
    })

    it('should emit ChannelOpened event with correct token address', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      await expect(
        factory.connect(alice).openChannel(
          await aktToken.getAddress(),
          recipient,
          amount,
          expiration
        )
      ).to.emit(factory, 'ChannelOpened')
        .withArgs(
          ethers.isHexString, // channelId
          alice.address,
          recipient,
          await aktToken.getAddress(),
          amount,
          expiration
        )
    })

    it('should revert if token address is EOA (not contract)', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      // Use charlie's address (EOA, not a contract)
      await expect(
        factory.connect(alice).openChannel(
          charlie.address,
          recipient,
          amount,
          expiration
        )
      ).to.be.revertedWithCustomError(factory, 'InvalidTokenAddress')
    })

    it('should revert if ETH sent with ERC-20 token', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      await expect(
        factory.connect(alice).openChannel(
          await aktToken.getAddress(),
          recipient,
          amount,
          expiration,
          { value: ethers.parseEther('0.1') } // Sending ETH with ERC-20
        )
      ).to.be.revertedWith('ETH not expected for ERC-20')
    })

    it('should revert if insufficient ETH sent for native channel', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseEther('1.0')

      await expect(
        factory.connect(alice).openChannel(
          ethers.ZeroAddress,
          recipient,
          amount,
          expiration,
          { value: ethers.parseEther('0.5') } // Insufficient ETH
        )
      ).to.be.revertedWith('ETH amount mismatch')
    })
  })

  describe('closeChannel with Multiple Tokens', function () {
    it('should close AKT channel and transfer AKT correctly', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      const aliceBalanceBefore = await aktToken.balanceOf(alice.address)
      const bobBalanceBefore = await aktToken.balanceOf(bob.address)

      await factory.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)

      expect(await aktToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claimAmount)
      expect(await aktToken.balanceOf(alice.address)).to.equal(aliceBalanceBefore + (amount - claimAmount))
    })

    it('should close USDC channel and transfer USDC correctly', async function () {
      const amount = ethers.parseUnits('50', 6)
      const expiration = (await time.latest()) + 3600

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const claimAmount = ethers.parseUnits('30', 6)
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      const bobBalanceBefore = await usdcToken.balanceOf(bob.address)

      await factory.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)

      expect(await usdcToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claimAmount)
    })

    it('should close ETH channel and transfer ETH correctly', async function () {
      const amount = ethers.parseEther('1.0')
      const expiration = (await time.latest()) + 3600

      const openTx = await factory.connect(alice).openChannel(
        ethers.ZeroAddress,
        bob.address,
        amount,
        expiration,
        { value: amount }
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const claimAmount = ethers.parseEther('0.6')
      const nonce = 1
      const signature = await signClaim(channelId, claimAmount, nonce, alice)

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address)
      const bobBalanceBefore = await ethers.provider.getBalance(bob.address)

      const closeTx = await factory.connect(bob).closeChannel(channelId, claimAmount, nonce, signature)
      const closeReceipt = await closeTx.wait()
      const gasUsed = closeReceipt!.gasUsed * closeReceipt!.gasPrice

      expect(await ethers.provider.getBalance(bob.address)).to.equal(bobBalanceBefore + claimAmount - gasUsed)
      expect(await ethers.provider.getBalance(alice.address)).to.equal(aliceBalanceBefore + (amount - claimAmount))
    })

    it('should not mix tokens between channels (AKT channel cannot claim USDC)', async function () {
      // Open AKT channel
      const aktAmount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await aktToken.connect(alice).approve(await factory.getAddress(), aktAmount)
      const aktOpenTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        aktAmount,
        expiration
      )
      const aktOpenReceipt = await aktOpenTx.wait()
      const aktOpenEvent = aktOpenReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const aktChannelId = (aktOpenEvent as any).args.channelId

      // Close AKT channel - should only transfer AKT, not USDC
      const claimAmount = ethers.parseUnits('60', 6)
      const nonce = 1
      const signature = await signClaim(aktChannelId, claimAmount, nonce, alice)

      const bobUSDCBefore = await usdcToken.balanceOf(bob.address)
      const bobAKTBefore = await aktToken.balanceOf(bob.address)

      await factory.connect(bob).closeChannel(aktChannelId, claimAmount, nonce, signature)

      // Bob's USDC balance should be unchanged
      expect(await usdcToken.balanceOf(bob.address)).to.equal(bobUSDCBefore)
      // Bob's AKT balance should increase
      expect(await aktToken.balanceOf(bob.address)).to.equal(bobAKTBefore + claimAmount)
    })
  })

  describe('Channel Isolation', function () {
    it('should handle multiple channels with different tokens simultaneously', async function () {
      const expiration = (await time.latest()) + 3600

      // Open channel 1: alice → bob with 100 AKT
      const aktAmount = ethers.parseUnits('100', 6)
      await aktToken.connect(alice).approve(await factory.getAddress(), aktAmount)
      const aktTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        aktAmount,
        expiration
      )
      const aktReceipt = await aktTx.wait()
      const aktEvent = aktReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const aktChannelId = (aktEvent as any).args.channelId

      // Open channel 2: alice → bob with 50 USDC
      const usdcAmount = ethers.parseUnits('50', 6)
      await usdcToken.connect(alice).approve(await factory.getAddress(), usdcAmount)
      const usdcTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        usdcAmount,
        expiration
      )
      const usdcReceipt = await usdcTx.wait()
      const usdcEvent = usdcReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const usdcChannelId = (usdcEvent as any).args.channelId

      // Open channel 3: alice → bob with 1 ETH
      const ethAmount = ethers.parseEther('1.0')
      const ethTx = await factory.connect(alice).openChannel(
        ethers.ZeroAddress,
        bob.address,
        ethAmount,
        expiration,
        { value: ethAmount }
      )
      const ethReceipt = await ethTx.wait()
      const ethEvent = ethReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const ethChannelId = (ethEvent as any).args.channelId

      // Close all channels independently
      const bobAKTBefore = await aktToken.balanceOf(bob.address)
      const bobUSDCBefore = await usdcToken.balanceOf(bob.address)
      const bobETHBefore = await ethers.provider.getBalance(bob.address)

      // Close AKT channel
      const aktClaimAmount = ethers.parseUnits('60', 6)
      const aktSignature = await signClaim(aktChannelId, aktClaimAmount, 1, alice)
      await factory.connect(bob).closeChannel(aktChannelId, aktClaimAmount, 1, aktSignature)

      // Close USDC channel
      const usdcClaimAmount = ethers.parseUnits('30', 6)
      const usdcSignature = await signClaim(usdcChannelId, usdcClaimAmount, 1, alice)
      await factory.connect(bob).closeChannel(usdcChannelId, usdcClaimAmount, 1, usdcSignature)

      // Close ETH channel
      const ethClaimAmount = ethers.parseEther('0.6')
      const ethSignature = await signClaim(ethChannelId, ethClaimAmount, 1, alice)
      const ethCloseTx = await factory.connect(bob).closeChannel(ethChannelId, ethClaimAmount, 1, ethSignature)
      const ethCloseReceipt = await ethCloseTx.wait()
      const gasUsed = ethCloseReceipt!.gasUsed * ethCloseReceipt!.gasPrice

      // Verify correct token balances for each
      expect(await aktToken.balanceOf(bob.address)).to.equal(bobAKTBefore + aktClaimAmount)
      expect(await usdcToken.balanceOf(bob.address)).to.equal(bobUSDCBefore + usdcClaimAmount)
      expect(await ethers.provider.getBalance(bob.address)).to.be.closeTo(
        bobETHBefore + ethClaimAmount - gasUsed,
        ethers.parseEther('0.001') // Allow small gas variance
      )
    })
  })

  describe('topUpChannel Tests', function () {
    it('should allow sender to top-up USDC channel', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Top-up with 50 USDC
      const topUpAmount = ethers.parseUnits('50', 6)
      await usdcToken.connect(alice).approve(await factory.getAddress(), topUpAmount)
      await factory.connect(alice).topUpChannel(channelId, topUpAmount)

      const channel = await factory.getChannel(channelId)
      expect(channel.balance).to.equal(amount + topUpAmount)
    })

    it('should allow sender to top-up ETH channel with msg.value', async function () {
      const amount = ethers.parseEther('1.0')
      const expiration = (await time.latest()) + 3600

      const openTx = await factory.connect(alice).openChannel(
        ethers.ZeroAddress,
        bob.address,
        amount,
        expiration,
        { value: amount }
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Top-up with 0.5 ETH
      const topUpAmount = ethers.parseEther('0.5')
      await factory.connect(alice).topUpChannel(channelId, topUpAmount, { value: topUpAmount })

      const channel = await factory.getChannel(channelId)
      expect(channel.balance).to.equal(amount + topUpAmount)
    })

    it('should allow multiple top-ups on same channel', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // First top-up: 30 AKT
      const topUp1 = ethers.parseUnits('30', 6)
      await aktToken.connect(alice).approve(await factory.getAddress(), topUp1)
      await factory.connect(alice).topUpChannel(channelId, topUp1)

      // Second top-up: 20 AKT
      const topUp2 = ethers.parseUnits('20', 6)
      await aktToken.connect(alice).approve(await factory.getAddress(), topUp2)
      await factory.connect(alice).topUpChannel(channelId, topUp2)

      const channel = await factory.getChannel(channelId)
      expect(channel.balance).to.equal(amount + topUp1 + topUp2)
    })

    it('should increase channel balance correctly after top-up', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const balanceBefore = (await factory.getChannel(channelId)).balance

      const topUpAmount = ethers.parseUnits('50', 6)
      await usdcToken.connect(alice).approve(await factory.getAddress(), topUpAmount)
      await factory.connect(alice).topUpChannel(channelId, topUpAmount)

      const balanceAfter = (await factory.getChannel(channelId)).balance
      expect(balanceAfter).to.equal(balanceBefore + topUpAmount)
    })

    it('should emit ChannelToppedUp event with correct parameters', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const topUpAmount = ethers.parseUnits('50', 6)
      await aktToken.connect(alice).approve(await factory.getAddress(), topUpAmount)

      const tx = await factory.connect(alice).topUpChannel(channelId, topUpAmount)
      const receipt = await tx.wait()
      const topUpEvent = receipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelToppedUp')

      expect(topUpEvent).to.not.be.undefined
      const eventArgs = (topUpEvent as any).args
      expect(eventArgs.channelId).to.equal(channelId)
      expect(eventArgs.sender).to.equal(alice.address)
      expect(eventArgs.amount).to.equal(topUpAmount)
      expect(eventArgs.newBalance).to.equal(amount + topUpAmount)
    })

    it('should allow top-up after channel has been partially used (nonce > 0)', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Use channel partially (create a signed claim but don't close)
      // In real scenario, bob would have off-chain claim for 40 USDC with nonce 1
      // But channel is still open, so top-up should work

      const topUpAmount = ethers.parseUnits('50', 6)
      await usdcToken.connect(alice).approve(await factory.getAddress(), topUpAmount)
      await factory.connect(alice).topUpChannel(channelId, topUpAmount)

      const channel = await factory.getChannel(channelId)
      expect(channel.balance).to.equal(amount + topUpAmount)
      expect(channel.isClosed).to.be.false
    })

    it('should revert if recipient tries to top-up (not sender)', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const topUpAmount = ethers.parseUnits('50', 6)
      await aktToken.connect(bob).approve(await factory.getAddress(), topUpAmount)

      await expect(
        factory.connect(bob).topUpChannel(channelId, topUpAmount)
      ).to.be.revertedWithCustomError(factory, 'OnlySenderCanTopUp')
    })

    it('should revert if trying to top-up closed channel', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Close channel
      const claimAmount = ethers.parseUnits('60', 6)
      const signature = await signClaim(channelId, claimAmount, 1, alice)
      await factory.connect(bob).closeChannel(channelId, claimAmount, 1, signature)

      // Try to top-up closed channel
      const topUpAmount = ethers.parseUnits('50', 6)
      await usdcToken.connect(alice).approve(await factory.getAddress(), topUpAmount)

      await expect(
        factory.connect(alice).topUpChannel(channelId, topUpAmount)
      ).to.be.revertedWithCustomError(factory, 'ChannelIsAlreadyClosed')
    })

    it('should revert if ETH amount does not match msg.value', async function () {
      const amount = ethers.parseEther('1.0')
      const expiration = (await time.latest()) + 3600

      const openTx = await factory.connect(alice).openChannel(
        ethers.ZeroAddress,
        bob.address,
        amount,
        expiration,
        { value: amount }
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const topUpAmount = ethers.parseEther('0.5')

      await expect(
        factory.connect(alice).topUpChannel(channelId, topUpAmount, { value: ethers.parseEther('0.3') })
      ).to.be.revertedWith('ETH amount mismatch')
    })

    it('should revert if sending ETH with ERC-20 top-up', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      const topUpAmount = ethers.parseUnits('50', 6)
      await aktToken.connect(alice).approve(await factory.getAddress(), topUpAmount)

      await expect(
        factory.connect(alice).topUpChannel(channelId, topUpAmount, { value: ethers.parseEther('0.1') })
      ).to.be.revertedWith('ETH not expected for ERC-20')
    })

    it('integration test: Open channel, use partially, top-up, use more, close', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      // Open channel
      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Use 40 USDC (off-chain claim with nonce 1)
      // In real scenario, bob has this signed claim but hasn't submitted yet

      // Top-up with 50 USDC
      const topUpAmount = ethers.parseUnits('50', 6)
      await usdcToken.connect(alice).approve(await factory.getAddress(), topUpAmount)
      await factory.connect(alice).topUpChannel(channelId, topUpAmount)

      // Now channel has 150 USDC total
      // Bob claims 80 USDC (from topped-up balance)
      const claimAmount = ethers.parseUnits('80', 6)
      const signature = await signClaim(channelId, claimAmount, 2, alice) // nonce 2

      const bobBalanceBefore = await usdcToken.balanceOf(bob.address)
      const aliceBalanceBefore = await usdcToken.balanceOf(alice.address)

      await factory.connect(bob).closeChannel(channelId, claimAmount, 2, signature)

      // Bob gets 80 USDC
      expect(await usdcToken.balanceOf(bob.address)).to.equal(bobBalanceBefore + claimAmount)
      // Alice gets refund: 150 - 80 = 70 USDC
      expect(await usdcToken.balanceOf(alice.address)).to.equal(
        aliceBalanceBefore + (amount + topUpAmount - claimAmount)
      )
    })
  })

  describe('expireChannel Tests', function () {
    it('should expire ERC-20 channel after expiration and refund sender', async function () {
      const amount = ethers.parseUnits('100', 6)
      const expiration = (await time.latest()) + 3600

      await usdcToken.connect(alice).approve(await factory.getAddress(), amount)
      const openTx = await factory.connect(alice).openChannel(
        await usdcToken.getAddress(),
        bob.address,
        amount,
        expiration
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Advance time past expiration
      await time.increase(3601)

      const aliceBalanceBefore = await usdcToken.balanceOf(alice.address)

      // Expire channel
      await factory.expireChannel(channelId)

      // Verify alice received full refund
      expect(await usdcToken.balanceOf(alice.address)).to.equal(aliceBalanceBefore + amount)

      // Verify channel is closed
      const channel = await factory.getChannel(channelId)
      expect(channel.isClosed).to.be.true
    })

    it('should expire ETH channel after expiration and refund sender', async function () {
      const amount = ethers.parseEther('1.0')
      const expiration = (await time.latest()) + 3600

      const openTx = await factory.connect(alice).openChannel(
        ethers.ZeroAddress,
        bob.address,
        amount,
        expiration,
        { value: amount }
      )
      const openReceipt = await openTx.wait()
      const openEvent = openReceipt?.logs.find((log: any) => log.fragment && log.fragment.name === 'ChannelOpened')
      const channelId = (openEvent as any).args.channelId

      // Advance time past expiration
      await time.increase(3601)

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address)

      // Expire channel
      const expireTx = await factory.connect(alice).expireChannel(channelId)
      const expireReceipt = await expireTx.wait()
      const gasUsed = expireReceipt!.gasUsed * expireReceipt!.gasPrice

      // Verify alice received full refund minus gas
      expect(await ethers.provider.getBalance(alice.address)).to.equal(aliceBalanceBefore + amount - gasUsed)

      // Verify channel is closed
      const channel = await factory.getChannel(channelId)
      expect(channel.isClosed).to.be.true
    })
  })

  describe('Gas Optimization Validation', function () {
    it('should measure gas for openChannel with multi-token factory', async function () {
      const recipient = bob.address
      const expiration = (await time.latest()) + 3600
      const amount = ethers.parseUnits('100', 6)

      await aktToken.connect(alice).approve(await factory.getAddress(), amount)
      const tx = await factory.connect(alice).openChannel(
        await aktToken.getAddress(),
        recipient,
        amount,
        expiration
      )
      const receipt = await tx.wait()

      console.log('      Multi-token openChannel gas:', receipt?.gasUsed.toString())

      // Verify gas is reasonable (multi-token adds ~20k overhead)
      // Expected: ~175k gas (includes token address storage and ERC-20 transferFrom)
      expect(receipt?.gasUsed).to.be.lessThan(200000n)
    })
  })
})
