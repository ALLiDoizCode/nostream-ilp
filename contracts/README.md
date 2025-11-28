# Payment Channel Smart Contracts

This directory contains Solidity smart contracts for unidirectional payment channels used in the Nostream-ILP project.

## Contracts

### BasePaymentChannel.sol

**Purpose:** Native ETH payment channel contract for Base L2 deployment.

**Key Features:**
- Unidirectional payment channels (sender → recipient)
- Native ETH funding via `msg.value`
- Off-chain signed claims for micropayments
- Nonce-based replay protection
- Time-based channel expiration

**Network:** Base L2 (Ethereum L2)

**Functions:**
- `openChannel(recipient, expiration)` - Opens a new payment channel funded with ETH
- `closeChannel(channelId, claimAmount, nonce, signature)` - Closes channel with signed claim
- `expireChannel(channelId)` - Expires channel after expiration timestamp
- `generateChannelId(sender, recipient, timestamp)` - Generates unique channel ID
- `getChannel(channelId)` - Retrieves channel information
- `isChannelOpen(channelId)` - Checks if channel is open
- `getChannelBalance(channelId)` - Gets channel balance

---

### CronosPaymentChannel.sol

**Purpose:** AKT ERC-20 token payment channel contract for Cronos deployment.

**Key Features:**
- Modified from BasePaymentChannel.sol for ERC-20 token support
- Uses AKT token (ERC-20) instead of native ETH
- 95% code reuse from BasePaymentChannel.sol
- Same security guarantees and channel mechanics

**Network:** Cronos (EVM-compatible chain)

**Token Addresses:**
- **Cronos Mainnet:** `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
- **Cronos Testnet:** Use MockAKT (deployed in Story 3.2)

**Functions:**
- `constructor(address _aktTokenAddress)` - Initializes contract with AKT token address
- `openChannel(recipient, expiration, amount)` - Opens channel funded with AKT tokens
  - **Important:** Requires prior approval: `aktToken.approve(address(this), amount)`
- `closeChannel(channelId, claimAmount, nonce, signature)` - Closes channel with signed claim
- `expireChannel(channelId)` - Expires channel after expiration timestamp
- `generateChannelId(sender, recipient, timestamp)` - Generates unique channel ID
- `getChannel(channelId)` - Retrieves channel information
- `isChannelOpen(channelId)` - Checks if channel is open
- `getChannelBalance(channelId)` - Gets channel balance

**Modifications from BasePaymentChannel:**

1. **Import Addition:**
   ```solidity
   import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
   ```

2. **State Variable:**
   ```solidity
   IERC20 public immutable aktToken;
   ```

3. **Constructor:**
   ```solidity
   constructor(address _aktTokenAddress) {
       require(_aktTokenAddress != address(0), "Invalid token address");
       aktToken = IERC20(_aktTokenAddress);
   }
   ```

4. **openChannel() Changes:**
   - Added `uint256 amount` parameter
   - Removed `payable` modifier
   - Replaced `msg.value` checks with `amount` parameter
   - Added `aktToken.transferFrom(msg.sender, address(this), amount);`

5. **closeChannel() Changes:**
   - Replaced `payable(recipient).transfer()` → `aktToken.transfer(recipient, claimAmount)`
   - Replaced `payable(sender).transfer()` → `aktToken.transfer(sender, refundAmount)`

6. **expireChannel() Changes:**
   - Replaced `payable(sender).transfer()` → `aktToken.transfer(sender, balance)`

**Unchanged Functions (100% reuse):**
- `generateChannelId()` - Pure function (cryptographic)
- `_verifyClaimSignature()` - Signature verification logic
- `getChannel()`, `isChannelOpen()`, `getChannelBalance()` - View functions
- All events, errors, and Channel struct

---

## Usage

### Opening a Channel (Cronos)

```solidity
// 1. Approve contract to spend AKT tokens
IERC20 aktToken = IERC20(0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3);
aktToken.approve(address(cronosPaymentChannel), 1000000); // 1 AKT (6 decimals)

// 2. Open channel
uint256 expiration = block.timestamp + 7 days;
bytes32 channelId = cronosPaymentChannel.openChannel(
    recipientAddress,
    expiration,
    1000000 // 1 AKT
);
```

### Closing a Channel

```solidity
// Off-chain: Sender signs claim (channelId, claimAmount, nonce)
bytes memory signature = ...; // Sender's signature

// On-chain: Recipient submits claim
cronosPaymentChannel.closeChannel(
    channelId,
    claimAmount,
    nonce,
    signature
);
```

### Expiring a Channel

```solidity
// After expiration timestamp, anyone can call:
cronosPaymentChannel.expireChannel(channelId);
```

---

## Gas Costs (Estimated)

### BasePaymentChannel (Base L2, Native ETH)
- `openChannel`: ~50,000 gas (~$0.005 at 0.1 gwei)
- `closeChannel`: ~80,000 gas (~$0.008 at 0.1 gwei)

### CronosPaymentChannel (Cronos, ERC-20 AKT)
- `openChannel`: ~70,000 gas (~$0.001 at low CRO price)
- `closeChannel`: ~95,000 gas (~$0.0015 at low CRO price)

**Note:** ERC-20 adds ~35k gas overhead vs native ETH, but Cronos gas prices are 60-70% cheaper than Base L2, resulting in lower overall costs.

---

## Security Considerations

### Common to Both Contracts
- **Reentrancy Protection:** Uses OpenZeppelin's `ReentrancyGuard` on `closeChannel()`
- **Signature Verification:** Uses OpenZeppelin's `ECDSA` library (battle-tested)
- **Nonce Replay Protection:** Monotonically increasing nonce prevents replay attacks
- **Integer Overflow:** Solidity 0.8.20+ has built-in overflow checks

### CronosPaymentChannel Specific
- **ERC-20 Approval Required:** Users must approve contract before calling `openChannel()`
- **Token Contract Trust:** Contract trusts the AKT token address set in constructor (immutable)
- **Approval Front-Running:** Users should approve only the amount needed for the channel

### Recommended Security Audit
Before mainnet deployment, conduct a professional security audit covering:
- Signature verification correctness
- Reentrancy attack vectors
- Integer overflow/underflow edge cases
- ERC-20 token interaction safety

---

## Development

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests (Story 3.2)
```bash
npx hardhat test
npx hardhat test --grep "CronosPaymentChannel"
```

### Generate Coverage Report
```bash
npx hardhat coverage
```

---

## References

- **Epic 3 PRD:** `docs/prd/epic-3-cosmwasm-payment-channel-contract.md`
- **Research:** `docs/research/cronos-akt-deployment/README.md`
- **Comparison:** `docs/research/cronos-akt-deployment/findings/contract-modifications.md`
- **OpenZeppelin Contracts:** https://docs.openzeppelin.com/contracts/
- **Cronos Documentation:** https://docs.cronos.org/

---

## License

MIT License (see LICENSE file in repository root)
