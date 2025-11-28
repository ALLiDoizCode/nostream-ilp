# Contract Modifications Required for Cronos Deployment

**Research Date:** 2025-11-28
**Purpose:** Document exact code changes needed to deploy BasePaymentChannel.sol on Cronos with AKT token support

---

## Executive Summary

**Total Code Changes:** MINIMAL (~50 lines modified/added)
**Estimated Effort:** 3-5 hours (coding + testing)
**Compatibility:** 95% of existing code reusable

---

## Side-by-Side Comparison

### Contract Declarations

**Before (Base L2 - Native ETH):**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract BasePaymentChannel is ReentrancyGuard {
    // ... events and errors ...

    struct Channel {
        address sender;
        address recipient;
        uint256 balance;
        uint256 highestNonce;
        uint256 expiration;
        bool isClosed;
    }

    mapping(bytes32 => Channel) public channels;
```

**After (Cronos - ERC-20 AKT):**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";  // <-- NEW

contract CronosPaymentChannel is ReentrancyGuard {  // <-- RENAMED
    // ... events and errors (unchanged) ...

    struct Channel {
        address sender;
        address recipient;
        uint256 balance;
        uint256 highestNonce;
        uint256 expiration;
        bool isClosed;
    }

    mapping(bytes32 => Channel) public channels;

    // NEW: Token reference
    IERC20 public immutable aktToken;

    // NEW: Constructor
    constructor(address _aktTokenAddress) {
        aktToken = IERC20(_aktTokenAddress);
    }
```

---

### openChannel() Function

**Before (Native ETH):**
```solidity
function openChannel(
    address recipient,
    uint256 expiration
) external payable returns (bytes32 channelId) {  // <-- payable
    // Validate inputs
    if (recipient == address(0)) revert InvalidRecipient();
    if (expiration <= block.timestamp) revert ChannelExpired();
    if (msg.value == 0) revert InsufficientBalance();  // <-- msg.value

    // Generate unique channel ID
    channelId = generateChannelId(msg.sender, recipient, block.timestamp);

    // Store channel state
    channels[channelId] = Channel({
        sender: msg.sender,
        recipient: recipient,
        balance: msg.value,  // <-- Native ETH balance
        highestNonce: 0,
        expiration: expiration,
        isClosed: false
    });

    // Emit event
    emit ChannelOpened(
        channelId,
        msg.sender,
        recipient,
        msg.value,  // <-- Native ETH
        expiration
    );

    return channelId;
}
```

**After (ERC-20 AKT):**
```solidity
function openChannel(
    address recipient,
    uint256 expiration,
    uint256 amount  // <-- NEW parameter
) external returns (bytes32 channelId) {  // <-- REMOVED payable
    // Validate inputs
    if (recipient == address(0)) revert InvalidRecipient();
    if (expiration <= block.timestamp) revert ChannelExpired();
    if (amount == 0) revert InsufficientBalance();  // <-- Check amount parameter

    // NEW: Transfer AKT from sender to contract
    aktToken.transferFrom(msg.sender, address(this), amount);

    // Generate unique channel ID (unchanged)
    channelId = generateChannelId(msg.sender, recipient, block.timestamp);

    // Store channel state
    channels[channelId] = Channel({
        sender: msg.sender,
        recipient: recipient,
        balance: amount,  // <-- ERC-20 amount
        highestNonce: 0,
        expiration: expiration,
        isClosed: false
    });

    // Emit event
    emit ChannelOpened(
        channelId,
        msg.sender,
        recipient,
        amount,  // <-- ERC-20 amount
        expiration
    );

    return channelId;
}
```

**Changes:**
1. ✏️ Add `uint256 amount` parameter
2. ✏️ Remove `payable` modifier
3. ✏️ Replace `msg.value` with `amount` (3 places)
4. ✏️ Add `aktToken.transferFrom()` call

---

### closeChannel() Function

**Before (Native ETH):**
```solidity
function closeChannel(
    bytes32 channelId,
    uint256 claimAmount,
    uint256 nonce,
    bytes memory signature
) external nonReentrant {
    Channel storage channel = channels[channelId];

    // Validation (unchanged)
    if (channel.isClosed) revert("Channel already closed");
    if (block.timestamp > channel.expiration) revert ChannelExpired();

    // Verify signature (unchanged)
    _verifyClaimSignature(
        channelId,
        claimAmount,
        nonce,
        signature,
        channel.sender
    );

    // Validate nonce and amount (unchanged)
    if (nonce <= channel.highestNonce) revert NonceNotMonotonic();
    if (claimAmount > channel.balance) revert InsufficientBalance();

    // Update state (unchanged)
    channel.isClosed = true;
    channel.highestNonce = nonce;

    // Transfer funds to recipient
    payable(channel.recipient).transfer(claimAmount);  // <-- Native ETH

    // Refund remaining balance to sender
    uint256 refundAmount = channel.balance - claimAmount;
    if (refundAmount > 0) {
        payable(channel.sender).transfer(refundAmount);  // <-- Native ETH
    }

    emit ChannelClosed(channelId, claimAmount, nonce);
}
```

**After (ERC-20 AKT):**
```solidity
function closeChannel(
    bytes32 channelId,
    uint256 claimAmount,
    uint256 nonce,
    bytes memory signature
) external nonReentrant {
    Channel storage channel = channels[channelId];

    // Validation (UNCHANGED)
    if (channel.isClosed) revert("Channel already closed");
    if (block.timestamp > channel.expiration) revert ChannelExpired();

    // Verify signature (UNCHANGED)
    _verifyClaimSignature(
        channelId,
        claimAmount,
        nonce,
        signature,
        channel.sender
    );

    // Validate nonce and amount (UNCHANGED)
    if (nonce <= channel.highestNonce) revert NonceNotMonotonic();
    if (claimAmount > channel.balance) revert InsufficientBalance();

    // Update state (UNCHANGED)
    channel.isClosed = true;
    channel.highestNonce = nonce;

    // Transfer AKT to recipient
    aktToken.transfer(channel.recipient, claimAmount);  // <-- ERC-20 transfer

    // Refund remaining balance to sender
    uint256 refundAmount = channel.balance - claimAmount;
    if (refundAmount > 0) {
        aktToken.transfer(channel.sender, refundAmount);  // <-- ERC-20 transfer
    }

    emit ChannelClosed(channelId, claimAmount, nonce);
}
```

**Changes:**
1. ✏️ Replace `payable(addr).transfer()` with `aktToken.transfer()` (2 places)

---

### expireChannel() Function

**Before (Native ETH):**
```solidity
function expireChannel(bytes32 channelId) external {
    Channel storage channel = channels[channelId];

    // Validation
    if (block.timestamp <= channel.expiration) revert("Not expired");
    if (channel.isClosed) revert("Channel already closed");

    // Mark channel closed
    channel.isClosed = true;

    // Refund full balance to sender
    payable(channel.sender).transfer(channel.balance);  // <-- Native ETH

    emit ChannelClosed(channelId, 0, channel.highestNonce);
}
```

**After (ERC-20 AKT):**
```solidity
function expireChannel(bytes32 channelId) external {
    Channel storage channel = channels[channelId];

    // Validation (UNCHANGED)
    if (block.timestamp <= channel.expiration) revert("Not expired");
    if (channel.isClosed) revert("Channel already closed");

    // Mark channel closed (UNCHANGED)
    channel.isClosed = true;

    // Refund full balance to sender
    aktToken.transfer(channel.sender, channel.balance);  // <-- ERC-20 transfer

    emit ChannelClosed(channelId, 0, channel.highestNonce);
}
```

**Changes:**
1. ✏️ Replace `payable(addr).transfer()` with `aktToken.transfer()` (1 place)

---

### Other Functions (NO CHANGES)

**These functions remain 100% identical:**
- ✅ `generateChannelId()` - pure function, no token interaction
- ✅ `_verifyClaimSignature()` - cryptography only
- ✅ `getChannel()` - view function
- ✅ `isChannelOpen()` - view function
- ✅ `getChannelBalance()` - view function
- ✅ `extendExpiration()` - only modifies expiration timestamp

---

## Complete Modified Contract

See `code-examples/CronosPaymentChannel.sol` for full implementation.

**File size:** ~270 lines (vs 265 for original)
**Changes:** ~15 lines modified, ~5 lines added

---

## Testing Modifications

### Existing Tests (Need Updates)

**File:** `test/BasePaymentChannel.test.ts`

**Changes needed:**

#### 1. Setup/Deployment

**Before:**
```typescript
describe("BasePaymentChannel", function () {
    let paymentChannel: BasePaymentChannel;
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    beforeEach(async function () {
        [owner, alice, bob] = await ethers.getSigners();

        const PaymentChannel = await ethers.getContractFactory("BasePaymentChannel");
        paymentChannel = await PaymentChannel.deploy();
    });
```

**After:**
```typescript
describe("CronosPaymentChannel", function () {
    let paymentChannel: CronosPaymentChannel;
    let aktToken: MockERC20;  // <-- NEW
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    beforeEach(async function () {
        [owner, alice, bob] = await ethers.getSigners();

        // NEW: Deploy mock AKT token
        const Token = await ethers.getContractFactory("MockERC20");
        aktToken = await Token.deploy("Akash Token", "AKT", 6);  // 6 decimals

        // Mint test AKT to alice
        await aktToken.mint(alice.address, ethers.parseUnits("1000", 6));

        // Deploy payment channel with AKT address
        const PaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
        paymentChannel = await PaymentChannel.deploy(aktToken.target);
    });
```

#### 2. openChannel() Tests

**Before:**
```typescript
it("should open a channel with ETH", async function () {
    const recipient = bob.address;
    const expiration = (await time.latest()) + 3600;
    const amount = ethers.parseEther("1.0");  // 1 ETH

    const tx = await paymentChannel.connect(alice).openChannel(
        recipient,
        expiration,
        { value: amount }  // <-- Native ETH
    );

    await expect(tx).to.emit(paymentChannel, "ChannelOpened");
});
```

**After:**
```typescript
it("should open a channel with AKT", async function () {
    const recipient = bob.address;
    const expiration = (await time.latest()) + 3600;
    const amount = ethers.parseUnits("100", 6);  // 100 AKT (6 decimals)

    // NEW: Approve contract to spend AKT
    await aktToken.connect(alice).approve(paymentChannel.target, amount);

    // Open channel (no { value } parameter)
    const tx = await paymentChannel.connect(alice).openChannel(
        recipient,
        expiration,
        amount  // <-- Explicit amount parameter
    );

    await expect(tx).to.emit(paymentChannel, "ChannelOpened");
});
```

#### 3. closeChannel() Tests

**Before:**
```typescript
it("should close channel and transfer ETH", async function () {
    // ... setup ...

    const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
    const bobBalanceBefore = await ethers.provider.getBalance(bob.address);

    await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature);

    const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
    const bobBalanceAfter = await ethers.provider.getBalance(bob.address);

    expect(bobBalanceAfter - bobBalanceBefore).to.equal(claimAmount);
    expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(refundAmount);
});
```

**After:**
```typescript
it("should close channel and transfer AKT", async function () {
    // ... setup ...

    const aliceBalanceBefore = await aktToken.balanceOf(alice.address);
    const bobBalanceBefore = await aktToken.balanceOf(bob.address);

    await paymentChannel.connect(bob).closeChannel(channelId, claimAmount, nonce, signature);

    const aliceBalanceAfter = await aktToken.balanceOf(alice.address);
    const bobBalanceAfter = await aktToken.balanceOf(bob.address);

    expect(bobBalanceAfter - bobBalanceBefore).to.equal(claimAmount);
    expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(refundAmount);
});
```

**Key changes:**
- Replace `ethers.provider.getBalance()` with `aktToken.balanceOf()`
- Add approval step before opening channels
- Update amounts to use AKT decimals (6 instead of 18)

---

### New Test File Needed

**File:** `contracts/test/MockERC20.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

**Purpose:** Mock AKT token for testing (since testnet might not have AKT)

---

## Deployment Script Modifications

### Existing Deployment Script

**File:** `scripts/deploy.ts` (Base L2)

**Before:**
```typescript
import { ethers } from "hardhat";

async function main() {
    console.log("Deploying BasePaymentChannel...");

    const PaymentChannel = await ethers.getContractFactory("BasePaymentChannel");
    const paymentChannel = await PaymentChannel.deploy();

    await paymentChannel.waitForDeployment();

    console.log("BasePaymentChannel deployed to:", await paymentChannel.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

**After (Cronos):**
```typescript
import { ethers } from "hardhat";

async function main() {
    // Cronos mainnet AKT token address
    const AKT_TOKEN_ADDRESS = "0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3";

    console.log("Deploying CronosPaymentChannel with AKT token:", AKT_TOKEN_ADDRESS);

    const PaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
    const paymentChannel = await PaymentChannel.deploy(AKT_TOKEN_ADDRESS);  // <-- Pass token address

    await paymentChannel.waitForDeployment();

    const deployedAddress = await paymentChannel.getAddress();
    console.log("CronosPaymentChannel deployed to:", deployedAddress);

    // Verify AKT token is correctly set
    const aktToken = await paymentChannel.aktToken();
    console.log("AKT token configured:", aktToken);

    if (aktToken !== AKT_TOKEN_ADDRESS) {
        throw new Error("AKT token address mismatch!");
    }

    console.log("✅ Deployment successful!");
    console.log("Next step: Verify contract on CronoScan");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

**Changes:**
1. Add AKT token address constant
2. Pass token address to constructor
3. Verify token is correctly configured

---

## Hardhat Configuration Changes

**File:** `hardhat.config.ts`

**Before (Base L2 only):**
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: "0.8.20",
    networks: {
        "base-sepolia": {
            url: "https://sepolia.base.org",
            accounts: [process.env.PRIVATE_KEY!],
            chainId: 84532,
        },
    },
};

export default config;
```

**After (Add Cronos):**
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: "0.8.20",
    networks: {
        "base-sepolia": {
            url: "https://sepolia.base.org",
            accounts: [process.env.PRIVATE_KEY!],
            chainId: 84532,
        },
        // NEW: Cronos testnet
        "cronos-testnet": {
            url: "https://evm-t3.cronos.org:8545/",
            accounts: [process.env.PRIVATE_KEY!],
            chainId: 338,
        },
        // NEW: Cronos mainnet
        "cronos-mainnet": {
            url: "https://evm.cronos.org",
            accounts: [process.env.PRIVATE_KEY!],
            chainId: 25,
        },
    },
    etherscan: {
        apiKey: {
            "base-sepolia": process.env.BASESCAN_API_KEY!,
            "cronos-testnet": process.env.CRONOSCAN_API_KEY!,  // NEW
            "cronos-mainnet": process.env.CRONOSCAN_API_KEY!,  // NEW
        },
        customChains: [
            {
                network: "cronos-testnet",
                chainId: 338,
                urls: {
                    apiURL: "https://api-testnet.cronoscan.com/api",
                    browserURL: "https://testnet.cronoscan.com"
                }
            },
            {
                network: "cronos-mainnet",
                chainId: 25,
                urls: {
                    apiURL: "https://api.cronoscan.com/api",
                    browserURL: "https://cronoscan.com"
                }
            }
        ]
    }
};

export default config;
```

**Changes:**
1. Add Cronos testnet network config
2. Add Cronos mainnet network config
3. Add CronoScan API keys for verification
4. Add custom chains for Etherscan plugin

---

## Migration Checklist

### Code Changes
- [ ] Rename contract to `CronosPaymentChannel`
- [ ] Add `IERC20` import
- [ ] Add `aktToken` state variable
- [ ] Add constructor with token address parameter
- [ ] Modify `openChannel()` - add amount param, remove payable, add transferFrom
- [ ] Modify `closeChannel()` - replace native transfers with token.transfer
- [ ] Modify `expireChannel()` - replace native transfer with token.transfer
- [ ] Keep all other functions unchanged

### Test Changes
- [ ] Create `MockERC20.sol` test helper
- [ ] Update test deployment to include token deployment
- [ ] Add token approval before `openChannel()` calls
- [ ] Replace `getBalance()` with `token.balanceOf()`
- [ ] Update amount decimals (18 → 6 for AKT)

### Configuration Changes
- [ ] Update `hardhat.config.ts` with Cronos networks
- [ ] Add CronoScan API key to `.env`
- [ ] Update deployment script with AKT token address
- [ ] Create Cronos-specific deploy script

### Documentation Changes
- [ ] Update README with Cronos deployment instructions
- [ ] Add AKT token address to docs
- [ ] Document approval requirement for users

---

## Effort Estimation

| Task | Time Estimate |
|------|---------------|
| Modify contract code | 1 hour |
| Update tests | 1 hour |
| Update deployment scripts | 0.5 hours |
| Update Hardhat config | 0.5 hours |
| Test on local network | 1 hour |
| Deploy to Cronos testnet | 0.5 hours |
| Verify contract on CronoScan | 0.5 hours |
| **Total** | **5 hours** |

**Risk buffer:** +1 hour for unexpected issues
**Total with buffer:** **6 hours**

---

## Comparison: Modification vs Rewrite

| Approach | Effort | Risk | Code Reuse |
|----------|--------|------|------------|
| **Modify for Cronos** | 5-6 hours | Low | 95% |
| **Rewrite in CosmWasm** | 40-60 hours | Medium | 0% |
| **Savings** | **35-55 hours** | - | - |

**Recommendation:** ✅ Modify existing contract for Cronos deployment

---

## Next Steps

1. Create new branch: `feature/cronos-akt-payment-channel`
2. Copy `BasePaymentChannel.sol` to `CronosPaymentChannel.sol`
3. Apply modifications listed above
4. Create `MockERC20.sol` test helper
5. Update tests
6. Run local tests: `npx hardhat test`
7. Deploy to Cronos testnet
8. Verify on CronoScan
9. Test with real AKT (bridge small amount)

---

**Status:** ✅ COMPLETE
**Next:** See `code-examples/` for full contract implementation
