# CronosPaymentChannel Test Suite

## Overview

Comprehensive test suite for `CronosPaymentChannel.sol` - an ERC-20 token-based payment channel contract using Mock AKT tokens.

## Test Structure

```
CronosPaymentChannel.test.ts
├── Deployment (1 test)
├── openChannel (5 tests)
├── closeChannel (7 tests)
├── expireChannel (3 tests)
├── ERC-20 Approval Flow (5 tests)
├── View Functions (5 tests)
└── generateChannelId (3 tests)

Total: 29 tests
```

## Prerequisites

- Node.js v18+
- Hardhat 2.x
- OpenZeppelin Contracts 5.x
- TypeScript 5.3+

## Running Tests

### Run All Tests
```bash
npx hardhat test test/CronosPaymentChannel.test.ts
```

### Run Specific Test Suite
```bash
# Run only openChannel tests
npx hardhat test test/CronosPaymentChannel.test.ts --grep "openChannel"

# Run only closeChannel tests
npx hardhat test test/CronosPaymentChannel.test.ts --grep "closeChannel"

# Run only ERC-20 specific tests
npx hardhat test test/CronosPaymentChannel.test.ts --grep "ERC-20"
```

### Generate Coverage Report
```bash
npx hardhat coverage --testfiles "test/CronosPaymentChannel.test.ts"
```

### View Coverage HTML Report
```bash
npx hardhat coverage && open coverage/index.html
```

## Test Execution Time

**Expected execution time:** ~800-900ms for all 29 tests

## Coverage Results

**CronosPaymentChannel.sol Coverage:**
- Statement Coverage: **100%**
- Branch Coverage: **82.35%**
- Function Coverage: **100%**
- Line Coverage: **100%**

✅ Exceeds >90% coverage requirement (AC 11)

## Test Components

### Mock Contracts

**MockAKT.sol** - ERC-20 test token simulating Akash (AKT) token
- **Decimals:** 6 (matches real AKT token)
- **Initial Supply:** 1,000,000 AKT (minted to deployer)
- **Test Mint Function:** Allows distributing tokens to test accounts

### Test Fixtures

**Default Test Accounts:**
- `owner` - Contract deployer (receives initial MockAKT supply)
- `alice` - Primary sender account (opens channels, balance: 10,000 AKT)
- `bob` - Primary recipient account (receives payments, balance: 1,000 AKT)

**Default Test Amounts:**
- Small: 10 AKT = `ethers.parseUnits("10", 6)` = 10,000,000 base units
- Medium: 100 AKT = `ethers.parseUnits("100", 6)` = 100,000,000 base units
- Large: 1000 AKT = `ethers.parseUnits("1000", 6)` = 1,000,000,000 base units

**Default Expiration:**
- `(await time.latest()) + 3600` (1 hour in the future)

## Key Differences from BasePaymentChannel Tests

### ERC-20 vs Native ETH

| Aspect | BasePaymentChannel (ETH) | CronosPaymentChannel (AKT) |
|--------|--------------------------|----------------------------|
| **Amount Parameter** | `{ value: amount }` | `uint256 amount` |
| **Approval Required** | No | **Yes** - `approve()` before `openChannel()` |
| **Balance Checks** | `ethers.provider.getBalance()` | `aktToken.balanceOf()` |
| **Decimals** | 18 | **6** |
| **Amount Parsing** | `parseEther("1.0")` | `parseUnits("1.0", 6)` |
| **Transfer Handling** | Automatic revert | Must check `require(transfer())` |

### Required Modifications

1. **Deploy MockAKT token** in `beforeEach` hook
2. **Mint test tokens** to alice and bob
3. **Add approval step** before all `openChannel()` calls:
   ```typescript
   await aktToken.connect(alice).approve(paymentChannel.target, amount);
   ```
4. **Replace balance checks**:
   ```typescript
   // Before (ETH)
   await ethers.provider.getBalance(address)

   // After (AKT)
   await aktToken.balanceOf(address)
   ```
5. **Use 6 decimals** for all amount parsing:
   ```typescript
   // Before (ETH)
   ethers.parseEther("100")

   // After (AKT)
   ethers.parseUnits("100", 6)
   ```

## Test Case Details

### Deployment Tests
- Verifies AKT token address set correctly in constructor

### openChannel Tests
- ✅ Success: Valid AKT amount with approval
- ❌ Revert: Zero amount
- ❌ Revert: Zero address recipient
- ❌ Revert: Expiration in past
- ✅ Unique channel IDs for different timestamps

### closeChannel Tests
- ✅ Success: Partial claim (60 AKT from 100 AKT channel)
- ✅ Success: Full claim (100 AKT from 100 AKT channel)
- ❌ Revert: Claim exceeds balance
- ❌ Revert: Non-monotonic nonce
- ❌ Revert: Invalid signature (wrong signer)
- ❌ Revert: Channel already closed
- ❌ Revert: Channel expired

### expireChannel Tests
- ✅ Success: Refund sender after expiration
- ❌ Revert: Channel not expired yet
- ❌ Revert: Channel already closed

### ERC-20 Approval Flow Tests
- ❌ Revert: Insufficient approval (50 AKT approved, 100 AKT requested)
- ❌ Revert: Insufficient token balance (0 AKT balance, 100 AKT requested)
- ✅ Success: Opening channel after increasing approval
- ✅ Success: Multiple channels with same sender (independent balances)
- ✅ Success: Zero refund case (full claim, no revert on 0 transfer)

### View Functions Tests
- `getChannel()` - Returns correct channel state (all fields verified)
- `isChannelOpen()` - Returns true for open channels
- `isChannelOpen()` - Returns false for closed channels
- `getChannelBalance()` - Returns correct balance
- `aktToken()` - Returns correct token address

### generateChannelId Tests
- Deterministic generation (same inputs → same ID)
- Different timestamps → different IDs
- Different senders → different IDs

## Payment Claim Signature Generation

**Helper Function:**
```typescript
async function signClaim(
  channelId: string,
  claimAmount: bigint,
  nonce: number,
  signer: SignerWithAddress
): Promise<string> {
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256"],
    [channelId, claimAmount, nonce]
  );
  const signature = await signer.signMessage(ethers.getBytes(messageHash));
  return signature;
}
```

**Important:** Uses `signMessage()` which adds Ethereum signed message prefix, matching contract's `MessageHashUtils.toEthSignedMessageHash()`.

## Security Test Coverage

### Tested Attack Vectors
- ✅ Signature replay prevention (nonce monotonicity)
- ✅ Invalid signature rejection
- ✅ Balance overflow prevention (claim > balance)
- ✅ Double-close prevention (already closed check)
- ✅ Expiration enforcement (time-based checks)
- ✅ ERC-20 transfer safety (return value checks via Story 3.1 QA)
- ✅ Zero address validation (recipient check)

### Known Reentrancy Protection
- Contract uses OpenZeppelin `ReentrancyGuard` (inherited from BasePaymentChannel)
- Not explicitly tested as MockAKT is non-malicious
- Production deployment should use audited ERC-20 tokens

## Debugging Tips

### Common Test Failures

**"Insufficient allowance" Error:**
```typescript
// Missing approval step before openChannel
await aktToken.connect(alice).approve(paymentChannel.target, amount);
```

**"Invalid signature" Error:**
```typescript
// Wrong signer - must be channel sender (alice), not recipient (bob)
const signature = await signClaim(channelId, claimAmount, nonce, alice);
```

**"ChannelExpired" Error:**
```typescript
// Expiration too short or time manipulation issue
const expiration = (await time.latest()) + 3600; // Use 1 hour minimum
```

**Decimal Precision Errors:**
```typescript
// Wrong decimals - AKT uses 6, not 18
ethers.parseUnits("100", 6); // Correct for AKT
```

### Gas Profiling

To measure gas usage per transaction:
```bash
REPORT_GAS=true npx hardhat test test/CronosPaymentChannel.test.ts
```

## Future Test Enhancements

**Deferred to Story 3.4 (Testnet Deployment):**
- Real Cronos testnet testing with faucet AKT
- Gas optimization profiling
- Multi-block confirmation testing

**Deferred to Story 3.5 (Integration):**
- Dassie settlement module integration tests
- Cross-ledger payment flow tests

## Additional Resources

- **Contract Source:** `contracts/CronosPaymentChannel.sol`
- **Mock Token:** `contracts/test/MockAKT.sol`
- **Story Document:** `docs/stories/3.2.story.md`
- **Coverage Report:** `coverage/index.html` (after running `npx hardhat coverage`)

## Troubleshooting

### Tests Running Slowly
- Reduce number of time manipulations (`await time.increase()`)
- Use Hardhat snapshots for test isolation (if needed)
- Run specific test suites instead of full suite

### Coverage Report Not Generated
```bash
# Ensure solidity-coverage plugin is installed
npm install --save-dev solidity-coverage

# Verify hardhat.config.ts includes coverage plugin
```

### TypeChain Types Not Found
```bash
# Regenerate TypeChain types
npx hardhat compile

# Verify typechain-types/ directory exists
ls -la typechain-types/
```

---

**Last Updated:** 2025-11-28
**Test Suite Version:** 1.0
**Story:** Epic 3, Story 3.2
