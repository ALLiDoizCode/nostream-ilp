# AKT Token Addresses

**Last Updated:** 2025-11-28

---

## Cronos Mainnet

### AKT Token (IBC Bridged)
- **Contract Address:** `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
- **Token Name:** Akash Token (bridged from Akash Network)
- **Symbol:** AKT
- **Decimals:** 6 (likely, to be confirmed)
- **Type:** CRC-20 (Cronos ERC-20 compatible)
- **Bridge Method:** IBC (Inter-Blockchain Communication)

### Verification
- **CronoScan:** https://cronoscan.com/token/0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
- **Source Chain:** Akash Network (Cosmos-based)

### DeFi Integration
- **VVS Finance:** Active trading pairs, liquidity pools
- **Other Protocols:** Check CronoScan token page for full list

---

## Cronos Testnet

### AKT Token Status

**⚠️ NOT CONFIRMED**

The Cronos testnet may or may not have a bridged AKT token. Research did not find public documentation of a testnet AKT token address.

### Recommended Approach for Testing

**Deploy Mock AKT Token:**

```solidity
// contracts/test/MockAKT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockAKT is ERC20 {
    constructor() ERC20("Mock Akash Token", "AKT") {
        _mint(msg.sender, 1000000 * 10**6); // 1M AKT
    }

    function decimals() public pure override returns (uint8) {
        return 6;  // AKT uses 6 decimals (same as USDC)
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

**Deployment:**
```bash
npx hardhat run scripts/deploy-mock-akt.ts --network cronos-testnet
```

**After deployment, save the address for testing.**

---

## Akash Network (Native)

### Native AKT Token

- **Denomination:** `uakt` (micro AKT)
- **Decimals:** 6 (1 AKT = 1,000,000 uakt)
- **Chain:** Akash Network (Cosmos-based)
- **Wallet:** Keplr wallet
- **Explorer:** https://www.mintscan.io/akash

### Token Information
- **Total Supply:** Variable (check Mintscan)
- **Use Case:** Cloud computing payments on Akash Network
- **Website:** https://akash.network/

---

## How to Add AKT to MetaMask (Cronos)

### Manual Import

1. Open MetaMask
2. Switch to Cronos Mainnet (Chain ID: 25)
3. Click "Import tokens"
4. Select "Custom token"
5. Enter:
   - **Token Contract Address:** `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
   - **Token Symbol:** `AKT`
   - **Token Decimals:** `6` (should auto-fill)
6. Click "Add Custom Token"
7. Confirm

### Automatic Import (If Supported)

Some wallets and dApps can automatically detect AKT token. If not, use manual import above.

---

## Token Metadata

### AKT on Akash (Native)

| Property | Value |
|----------|-------|
| **Name** | Akash Token |
| **Symbol** | AKT |
| **Decimals** | 6 |
| **Type** | Native Cosmos token |
| **Denom** | uakt |

### AKT on Cronos (Bridged)

| Property | Value |
|----------|-------|
| **Name** | Akash Token (IBC) |
| **Symbol** | AKT |
| **Decimals** | 6 (likely) |
| **Type** | CRC-20 (ERC-20 compatible) |
| **Address** | 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3 |
| **Bridge** | IBC |

---

## Price Information

### Market Data Sources

- **CoinMarketCap:** https://coinmarketcap.com/currencies/akash-network/
- **CoinGecko:** https://www.coingecko.com/en/coins/akash-network
- **Binance:** (if listed)

### Historical Price (Nov 2025)

**Approximate:** $0.001 - $0.01 USD per AKT (verify on CoinMarketCap)

**Note:** AKT price is volatile. Always check current price before calculating gas costs or payment amounts.

---

## Liquidity Sources (Cronos)

### VVS Finance (Primary DEX)

- **Website:** https://vvs.finance/
- **AKT Pairs:** Check VVS Finance for current trading pairs (likely AKT/CRO, AKT/USDC)
- **Liquidity Pools:** Check if AKT liquidity pools are available for providing liquidity

### Other DEXes

Check CronoScan token page for other platforms using AKT.

---

## Contract Verification

### Verify AKT Token on Cronos

**JavaScript/TypeScript:**
```typescript
import { ethers } from "ethers";

const AKT_ADDRESS = "0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3";
const provider = new ethers.JsonRpcProvider("https://evm.cronos.org");

async function verifyAKT() {
    const akt = new ethers.Contract(
        AKT_ADDRESS,
        ["function name() view returns (string)",
         "function symbol() view returns (string)",
         "function decimals() view returns (uint8)",
         "function totalSupply() view returns (uint256)"],
        provider
    );

    console.log("Name:", await akt.name());
    console.log("Symbol:", await akt.symbol());
    console.log("Decimals:", await akt.decimals());
    console.log("Total Supply:", await akt.totalSupply());
}

verifyAKT();
```

**Expected Output:**
```
Name: Akash Token (or similar)
Symbol: AKT
Decimals: 6
Total Supply: (depends on bridge supply)
```

---

## Security Considerations

### Always Verify Token Address

**⚠️ CRITICAL:** Before sending funds or approving contracts, ALWAYS verify token address on CronoScan:
- Check contract is verified (green checkmark)
- Check token name/symbol match
- Check transaction history (should have activity)
- Check liquidity on DEXes

### Avoid Fake Tokens

**Scam Risk:** Fake tokens with similar names may exist. Always use official address: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`

### Check Before Large Transfers

1. Send small test amount first (e.g., 1 AKT)
2. Verify receipt in destination wallet
3. Then send larger amount

---

## Bridge Information

### Cronos Bridge

- **URL:** https://cronos.org/bridge
- **Supported Tokens:** AKT (from Akash Network)
- **Method:** IBC (Inter-Blockchain Communication)
- **Fee:** Network gas fees only (promotional bridge fee waived)

### Alternative Bridges

- Check `ibc-bridge-analysis.md` for detailed bridge information
- Official Cronos bridge is recommended for AKT

---

## References

- **AKT Token Announcement:** https://medium.com/cronos-chain/cronos-launches-ibc-bridge-with-akash-chain-akt-token-99368bbbd98
- **Cronos Token Addresses:** https://docs.cronos.org/for-dapp-developers/cronos-smart-contract/token-contract-addresses
- **VVS Finance:** https://vvs.finance/

---

**Status:** Mainnet address confirmed, testnet address TBD
**Recommendation:** Use MockAKT for testnet, real AKT for mainnet
