# Epic 3: AKT Payment Channel Deployment (Cronos)

**Updated:** 2025-11-28
**Status:** READY FOR IMPLEMENTATION

**Goal:** Deploy AKT payment channel support via Cronos EVM, enabling users to open payment channels with AKT tokens for Nostr-ILP micropayments.

---

## 📋 Context

**Research Findings (2025-11-28):**
- Cronos deployment enables AKT payment channels with **95% code reuse** from Base L2 contract
- **8x faster** development (7 hours vs 57 hours for CosmWasm)
- **8x cheaper** development cost ($1,140 vs $8,625)
- **60-70% cheaper gas** than Base L2 ($0.001 vs $0.003 per channel)
- Production-ready in **1 week** vs 3 weeks

**Decision:** Focus on Cronos deployment for MVP. Native CosmWasm can be considered in future if volume exceeds 100k channels/month.

**Research Documentation:** `docs/research/cronos-akt-deployment/`

---

## Stories

### Story 3.1: Modify BasePaymentChannel for ERC-20 AKT Support

**As a** developer,
**I want** to modify BasePaymentChannel.sol to work with AKT ERC-20 tokens on Cronos,
**so that** I can reuse 95% of existing battle-tested code.

**Acceptance Criteria:**
1. Create new contract file: `contracts/CronosPaymentChannel.sol` (copy from BasePaymentChannel.sol)
2. Add IERC20 import: `import "@openzeppelin/contracts/token/ERC20/IERC20.sol";`
3. Add token state variable: `IERC20 public immutable aktToken;`
4. Add constructor: `constructor(address _aktTokenAddress) { aktToken = IERC20(_aktTokenAddress); }`
5. Modify `openChannel()`:
   - Add `uint256 amount` parameter
   - Remove `payable` modifier
   - Replace `msg.value` checks with `amount` parameter
   - Add `aktToken.transferFrom(msg.sender, address(this), amount);`
6. Modify `closeChannel()`:
   - Replace `payable(recipient).transfer()` with `aktToken.transfer(recipient, claimAmount)`
   - Replace sender refund with `aktToken.transfer(sender, refundAmount)`
7. Modify `expireChannel()`:
   - Replace `payable(sender).transfer()` with `aktToken.transfer(sender, balance)`
8. All other functions remain unchanged (generateChannelId, _verifyClaimSignature, getChannel, etc.)
9. Contract compiles successfully
10. Code changes documented in PR

**Estimated Effort:** 1 hour

**Reference:** `docs/research/cronos-akt-deployment/findings/contract-modifications.md`

---

### Story 3.2: Create MockAKT Token and Update Tests

**As a** developer,
**I want** updated tests that work with ERC-20 tokens instead of native ETH,
**so that** I can validate CronosPaymentChannel behavior.

**Acceptance Criteria:**
1. Create mock token: `contracts/test/MockAKT.sol`
   ```solidity
   contract MockAKT is ERC20 {
       constructor() ERC20("Mock Akash Token", "AKT") {
           _mint(msg.sender, 1000000 * 10**6); // 1M AKT
       }
       function decimals() public pure override returns (uint8) {
           return 6;  // AKT uses 6 decimals
       }
       function mint(address to, uint256 amount) external {
           _mint(to, amount);
       }
   }
   ```
2. Update test file: `test/CronosPaymentChannel.test.ts`
3. Deploy MockAKT token in `beforeEach` hook
4. Mint test AKT to test accounts
5. Add approval step before all `openChannel()` calls: `await aktToken.connect(alice).approve(channel.target, amount)`
6. Replace all `ethers.provider.getBalance()` with `aktToken.balanceOf()`
7. Replace all `ethers.parseEther()` with `ethers.parseUnits(amount, 6)` (6 decimals for AKT)
8. Add new test: "should revert if insufficient approval"
9. Add new test: "should revert if insufficient token balance"
10. All existing tests pass with ERC-20 modifications
11. Test coverage >90%

**Estimated Effort:** 1.5 hours

**Reference:** `docs/research/cronos-akt-deployment/findings/contract-modifications.md` (Testing section)

---

### Story 3.3: Configure Hardhat for Cronos and Create Deployment Scripts

**As a** developer,
**I want** Hardhat configured for Cronos deployment with proper scripts,
**so that** I can deploy to testnet and mainnet.

**Acceptance Criteria:**
1. Update `hardhat.config.ts`:
   ```typescript
   networks: {
     "cronos-testnet": {
       url: "https://evm-t3.cronos.org:8545/",
       accounts: [process.env.PRIVATE_KEY!],
       chainId: 338,
     },
     "cronos-mainnet": {
       url: "https://evm.cronos.org",
       accounts: [process.env.PRIVATE_KEY!],
       chainId: 25,
     }
   }
   ```
2. Add CronoScan verification config:
   ```typescript
   etherscan: {
     apiKey: {
       "cronos-testnet": process.env.CRONOSCAN_API_KEY,
       "cronos-mainnet": process.env.CRONOSCAN_API_KEY,
     },
     customChains: [/* Cronos testnet/mainnet config */]
   }
   ```
3. Create deployment script: `scripts/deploy-cronos-testnet.ts`
   - Deploy MockAKT token
   - Deploy CronosPaymentChannel with MockAKT address
   - Mint test AKT to deployer
   - Log all addresses
4. Create deployment script: `scripts/deploy-cronos-mainnet.ts`
   - Use real AKT address: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
   - Deploy CronosPaymentChannel only
5. Update `.env.example` with Cronos variables
6. Local compilation succeeds: `npx hardhat compile`
7. Documentation: Deployment instructions in README

**Estimated Effort:** 0.5 hours

**Reference:** `docs/research/cronos-akt-deployment/findings/deployment-guide.md`

---

### Story 3.4: Deploy to Cronos Testnet and Verify

**As a** developer,
**I want** CronosPaymentChannel deployed and verified on Cronos testnet,
**so that** I can test with real blockchain before mainnet.

**Acceptance Criteria:**
1. MetaMask configured with Cronos testnet (chainId 338)
2. Test CRO obtained from faucet: https://cronos.org/faucet
3. Deploy MockAKT and CronosPaymentChannel to testnet:
   ```bash
   npx hardhat run scripts/deploy-cronos-testnet.ts --network cronos-testnet
   ```
4. Contracts verified on CronoScan:
   ```bash
   npx hardhat verify --network cronos-testnet <MOCK_AKT_ADDRESS>
   npx hardhat verify --network cronos-testnet <CHANNEL_ADDRESS> <MOCK_AKT_ADDRESS>
   ```
5. Verification shows green checkmark on https://testnet.cronoscan.com
6. Test channel lifecycle:
   - Mint AKT to test account
   - Approve channel contract
   - Open channel
   - Verify channel state with `getChannel()`
   - Close channel (or let expire)
   - Verify final balances
7. Gas costs measured and documented
8. Contract addresses documented in project README
9. Screenshots of successful transactions saved

**Estimated Effort:** 1 hour

**Reference:** `docs/research/cronos-akt-deployment/findings/deployment-guide.md` (Step 6-8)

---

### Story 3.5: Create Dassie Cronos Settlement Module

**As a** developer,
**I want** a Dassie settlement module for Cronos payment channels,
**so that** ILP payments can settle via AKT on Cronos.

**Acceptance Criteria:**
1. Create module: `packages/app-dassie/src/settlement/cronos/cronos-settlement.ts`
2. Reuse structure from Base L2 settlement module (Story 2.6)
3. Configuration:
   ```typescript
   interface CronosSettlementConfig {
     rpcUrl: string;  // Cronos RPC
     chainId: number;  // 25 for mainnet, 338 for testnet
     channelContractAddress: string;
     aktTokenAddress: string;
     privateKey: string;
   }
   ```
4. Implement methods:
   - `openChannel(recipient, amount, expiration) -> channelId`
   - `closeChannel(channelId, finalClaim) -> txHash`
   - `getChannelBalance(channelId) -> balance`
   - `isChannelOpen(channelId) -> boolean`
5. Handle ERC-20 approval flow:
   - Check current allowance
   - Approve if insufficient
   - Execute channel open
6. Error handling: insufficient AKT, approval failures, gas estimation
7. Integration test with testnet contract
8. Unit tests with mocked ethers.js provider
9. Documentation: How to configure Cronos settlement

**Estimated Effort:** 1.5 hours

**Reference:** Similar to Story 2.6 (Base L2 settlement), adapted for Cronos

---

### Story 3.7: Deploy to Cronos Mainnet (Production)

**As a** developer,
**I want** CronosPaymentChannel deployed to Cronos mainnet,
**so that** users can open payment channels with real AKT.

**Acceptance Criteria:**
1. Pre-deployment checklist completed:
   - [ ] Contract audited or peer-reviewed
   - [ ] Full test coverage (>90%)
   - [ ] Testnet testing complete (multiple channels tested)
   - [ ] Gas costs validated (<$0.01 per channel)
   - [ ] Real AKT token address confirmed: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
   - [ ] Sufficient CRO for deployment gas (>10 CRO)
   - [ ] Private key backed up securely
   - [ ] Monitoring/alerting configured
2. Deploy to mainnet:
   ```bash
   npx hardhat run scripts/deploy-cronos-mainnet.ts --network cronos-mainnet
   ```
3. Verify contract on CronoScan:
   ```bash
   npx hardhat verify --network cronos-mainnet <ADDRESS> 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
   ```
4. Test with small amount of real AKT:
   - Open channel with 1 AKT
   - Verify channel state
   - Close channel
   - Verify refund received
5. Update production config:
   - Nostream relay: Cronos mainnet RPC URL
   - Dassie settlement: CronosPaymentChannel address
6. Document mainnet addresses:
   - CronosPaymentChannel: `<deployed_address>`
   - AKT Token: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
7. Announce deployment:
   - Update project README
   - Notify team/users
   - Post to Nostr relays

**Estimated Effort:** 0.5 hours

**Reference:** `docs/research/cronos-akt-deployment/findings/deployment-guide.md` (Step 9)

---

## Epic Summary

### Effort Estimate

| Story | Description | Effort |
|-------|-------------|--------|
| 3.1 | Modify BasePaymentChannel for ERC-20 AKT | 1.0 hour |
| 3.2 | Create MockAKT and update tests | 1.5 hours |
| 3.3 | Configure Hardhat and deployment scripts | 0.5 hours |
| 3.4 | Deploy to Cronos testnet | 1.0 hour |
| 3.5 | Create Dassie Cronos settlement module | 1.5 hours |
| 3.7 | Deploy to Cronos mainnet | 0.5 hours |
| **Total** | | **6.0 hours** |

**Timeline:** 1 week (with testing and review)
**Cost:** ~$900 @ $150/hour

---

## Next Steps

### Immediate (This Week)
1. ✅ Review research findings with team
2. ✅ Update Epic 3 documentation (DONE)
3. 🔲 **Decision Point:** Approve Cronos deployment approach
4. 🔲 Create branch: `feature/cronos-akt-payment-channel`
5. 🔲 Begin Story 3.1 (contract modification)

### Short-term (Next 2 Weeks)
1. Complete Stories 3.1 through 3.7
2. Deploy to Cronos testnet
3. Integrate with Dassie settlement module
4. Test end-to-end flow (IBC bridge + payment channel)
5. Deploy to mainnet (when ready)

### Long-term (3-6 Months)
1. Monitor Cronos payment channel usage and gas costs
2. Collect user feedback on IBC bridge experience
3. Evaluate future optimizations (CosmWasm native deployment if volume >100k channels/month)

---

## Success Metrics

- ✅ Contract deployed to Cronos mainnet
- ✅ Gas cost per channel <$0.01
- ✅ Code reuse >90% from Base L2 contract
- ✅ Time to production <2 weeks
- ✅ Zero security incidents
- ✅ User documentation complete
- ✅ IBC bridge integration documented with screenshots

---

## References

**Research Documentation:**
- `docs/research/cronos-akt-deployment/` - Complete research findings on Cronos deployment
  - README.md - Executive summary
  - findings/ - Detailed analysis (EVM compatibility, AKT integration, gas costs, deployment guide)
  - comparisons/ - Strategic comparison with CosmWasm approach

**Related Epics:**
- Epic 2: Dassie payment integration (Base L2 settlement module serves as template for Story 3.5)

**External Resources:**
- Cronos Documentation: https://docs.cronos.org
- IBC Bridge: https://cronos.org/bridge
- CronoScan: https://cronoscan.com
- AKT Token Address (Cronos mainnet): `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`

---

**Epic Status:** READY FOR IMPLEMENTATION
**Last Updated:** 2025-11-28
**Next Review:** After deployment to mainnet

---
