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

### MultiTokenPaymentChannelFactory.sol

**Purpose:** Multi-token payment channel factory supporting any ERC-20 token or native ETH.

**Key Features:**
- Unidirectional payment channels with dynamic token selection
- Support for any ERC-20 token (AKT, USDC, CRO, etc.)
- Support for native ETH via `address(0)` convention
- Channel top-up functionality for adding funds without closing
- Token validation (prevents EOA addresses)
- Same security guarantees as single-token contracts

**Network:** Multi-chain deployment (Cronos, Base, Arbitrum)

**Supported Tokens:**
- **ERC-20 Tokens:** Any standard ERC-20 token (specify token address)
- **Native ETH:** Use `address(0)` as token address

**Functions:**
- `openChannel(tokenAddress, recipient, amount, expiration)` - Opens channel with any token
  - **For ERC-20:** Requires prior approval: `token.approve(address(this), amount)`
  - **For ETH:** Send ETH via `msg.value` and use `address(0)` as token address
- `closeChannel(channelId, claimAmount, nonce, signature)` - Closes channel with signed claim
- `expireChannel(channelId)` - Expires channel after expiration timestamp
- `topUpChannel(channelId, amount)` - Adds funds to existing channel (sender only)
- `generateChannelId(sender, recipient, timestamp)` - Generates unique channel ID
- `getChannel(channelId)` - Retrieves channel information
- `isChannelOpen(channelId)` - Checks if channel is open
- `getChannelBalance(channelId)` - Gets channel balance

**Channel Struct:**
```solidity
struct Channel {
    address sender;        // Payer's address
    address recipient;     // Payee's address
    address token;         // ERC-20 token address or address(0) for ETH
    uint256 balance;       // Locked token amount
    uint256 highestNonce;  // Last verified nonce (prevents replay)
    uint256 expiration;    // Unix timestamp when channel expires
    bool isClosed;         // Channel status flag
}
```

**Events:**
```solidity
event ChannelOpened(
    bytes32 indexed channelId,
    address indexed sender,
    address indexed recipient,
    address token,          // Token address (address(0) for ETH)
    uint256 balance,
    uint256 expiration
);

event ChannelToppedUp(
    bytes32 indexed channelId,
    address indexed sender,
    uint256 amount,
    uint256 newBalance,
    uint256 timestamp
);
```

**Token Validation:**
- Token address must be a contract (not EOA), except `address(0)` for native ETH
- Validates `tokenAddress.code.length > 0` to ensure it's a contract
- Prevents accidental use of user addresses as tokens

**Top-Up Functionality:**
- Only channel sender can top-up their own channel
- Channel must not be closed
- Supports both ERC-20 and native ETH top-ups
- Increases channel balance without closing/reopening
- Use case: Add funds mid-stream without interrupting service

**Gas Costs (Estimated):**
- `openChannel`: ~175,000 gas (multi-token overhead ~25k vs single-token)
- `closeChannel`: ~95,000 gas (similar to single-token)
- `topUpChannel`: ~50,000 gas

**Modifications from CronosPaymentChannel:**

1. **Removed Immutable Token:**
   - Removed: `IERC20 public immutable aktToken;`
   - No constructor parameter for token address

2. **Dynamic Token Per Channel:**
   - Added `address token` field to Channel struct
   - Added `address tokenAddress` parameter to `openChannel()`

3. **Token-Specific Transfers:**
   - Use `IERC20(channel.token).transfer()` instead of `aktToken.transfer()`
   - Added ETH transfer logic: `payable(address).transfer()`

4. **Native ETH Support:**
   - `openChannel()` is now `payable`
   - Special handling for `tokenAddress == address(0)`:
     ```solidity
     if (tokenAddress == address(0)) {
         require(msg.value == amount, "ETH amount mismatch");
     } else {
         require(msg.value == 0, "ETH not expected for ERC-20");
         require(IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");
     }
     ```

5. **Top-Up Function:**
   - New function: `topUpChannel(channelId, amount)`
   - Validates sender and channel status
   - Emits `ChannelToppedUp` event

**Unchanged Functions (100% reuse from CronosPaymentChannel):**
- `generateChannelId()` - Pure function (cryptographic)
- `_verifyClaimSignature()` - Signature verification logic
- `getChannel()`, `isChannelOpen()`, `getChannelBalance()` - View functions

---

## Usage

### Opening a Channel with Multi-Token Factory

**With ERC-20 Token (USDC):**
```solidity
// 1. Approve contract to spend USDC tokens
IERC20 usdcToken = IERC20(0xUSDC_ADDRESS);
usdcToken.approve(address(multiTokenFactory), 1000000); // 1 USDC (6 decimals)

// 2. Open channel
uint256 expiration = block.timestamp + 7 days;
bytes32 channelId = multiTokenFactory.openChannel(
    address(usdcToken),  // Token address
    recipientAddress,
    1000000,             // 1 USDC
    expiration
);
```

**With Native ETH:**
```solidity
// Open channel with ETH (no approval needed)
uint256 expiration = block.timestamp + 7 days;
bytes32 channelId = multiTokenFactory.openChannel{value: 1 ether}(
    address(0),          // address(0) = native ETH
    recipientAddress,
    1 ether,
    expiration
);
```

### Opening a Channel (Cronos - Legacy Single-Token)

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

### Top-Up a Channel

**ERC-20 Top-Up:**
```solidity
// Approve additional tokens
usdcToken.approve(address(multiTokenFactory), 500000); // 0.5 USDC

// Top-up existing channel
multiTokenFactory.topUpChannel(channelId, 500000);
```

**Native ETH Top-Up:**
```solidity
// Top-up ETH channel
multiTokenFactory.topUpChannel{value: 0.5 ether}(channelId, 0.5 ether);
```

### Expiring a Channel

```solidity
// After expiration timestamp, anyone can call:
cronosPaymentChannel.expireChannel(channelId);
// or
multiTokenFactory.expireChannel(channelId);
```

---

## Gas Costs (Estimated)

### MultiTokenPaymentChannelFactory (Multi-Chain)
- `openChannel`: ~175,000 gas (measured in tests)
- `closeChannel`: ~95,000 gas
- `topUpChannel`: ~50,000 gas
- **Note:** Multi-token adds ~25k gas overhead vs single-token due to dynamic token storage

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

### MultiTokenPaymentChannelFactory Specific
- **Token Address Validation:** Contract validates token address is a contract (not EOA) using `code.length > 0`
- **Token Isolation:** Each channel stores its own token address, preventing cross-token contamination
- **ETH/ERC-20 Confusion Prevention:** Validates `msg.value` matches expected behavior (0 for ERC-20, amount for ETH)
- **Top-Up Authorization:** Only channel sender can top-up, preventing unauthorized fund injection
- **Malicious Token Risk:** Contract trusts the token address provided - use only verified tokens

### Recommended Security Audit
Before mainnet deployment, conduct a professional security audit covering:
- Signature verification correctness
- Reentrancy attack vectors
- Integer overflow/underflow edge cases
- ERC-20 token interaction safety

---

## Base Mainnet Deployment

### MultiTokenPaymentChannelFactory (Story 4.2)

**Network:** Base Mainnet (Chain ID: 8453)
**Deployed Address:** `0xf7e968d6f3bdFC504A434288Ea3f243e033e846F`
**BaseScan:** https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F#code
**Verification Status:** ✅ Verified
**Deployment Date:** 2025-12-05

**Supported Tokens:**
- **Native ETH:** `address(0)` - 18 decimals
- **USDC (Circle):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` - 6 decimals

**Gas Cost Benchmarks (Base Mainnet):**
| Operation | Gas Used | USD Cost* | Status |
|-----------|----------|-----------|--------|
| openChannel (ETH) | 121,277 | $0.000437 | ✅ |
| topUpChannel (ETH) | 36,158 | $0.000130 | ✅ |
| closeChannel (ETH) | 129,089 | $0.000465 | ✅ |
| **Total Lifecycle** | **250,366** | **$0.000902** | ✅ <$0.01 |

*Gas price: 0.0012 gwei, ETH: $3,000 USD

**Configuration File:** `src/config/base-tokens.yaml`

**Usage Example (Base + ETH):**
```solidity
// Import factory
IMultiTokenPaymentChannelFactory factory = IMultiTokenPaymentChannelFactory(
    0xf7e968d6f3bdFC504A434288Ea3f243e033e846F
);

// Open ETH channel
uint256 expiration = block.timestamp + 3600; // 1 hour
bytes32 channelId = factory.openChannel{value: 0.001 ether}(
    address(0),           // Native ETH
    recipientAddress,
    0.001 ether,
    expiration
);

// Top-up channel
factory.topUpChannel{value: 0.0005 ether}(channelId, 0.0005 ether);

// Close channel with signed claim
bytes32 messageHash = keccak256(abi.encodePacked(channelId, claimAmount, nonce));
bytes memory signature = sender.sign(messageHash.toEthSignedMessageHash());
factory.closeChannel(channelId, claimAmount, nonce, signature);
```

**Usage Example (Base + USDC):**
```solidity
// Import USDC
IERC20 usdc = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);

// Approve factory
usdc.approve(0xf7e968d6f3bdFC504A434288Ea3f243e033e846F, 10_000000); // 10 USDC

// Open USDC channel
bytes32 channelId = factory.openChannel(
    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, // USDC address
    recipientAddress,
    10_000000,                                  // 10 USDC (6 decimals)
    expiration
);

// Top-up with USDC (requires additional approval)
usdc.approve(address(factory), 5_000000); // 5 USDC
factory.topUpChannel(channelId, 5_000000);
```

**Deployment Details:**
- Transaction Hash: `0x4c4d9bbfecc6df67e5359c0b6cc4c8588df96f7c0f03df31c4a7588fbf9b0c6d`
- Deployment Cost: 0.00000141 ETH ($0.0042)
- Gas Used: 1,173,394
- Deployer: `0x6f7830A69BF0022AA586bd0E94FB34f86e7075cB`

**Documentation:**
- Full deployment guide: `docs/deployment/base-deployment.md`
- Token configuration: `src/config/base-tokens.yaml`
- Story 4.2: Base mainnet deployment

**Security Notes:**
- ✅ Verified source code on BaseScan
- ✅ ReentrancyGuard on closeChannel()
- ✅ Token address validation (prevents EOA)
- ✅ Signature verification via OpenZeppelin ECDSA
- ⚠️ Production use: Consider professional security audit

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
