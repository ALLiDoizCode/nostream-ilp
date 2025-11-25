# nilDB (Private Storage) Skill

This skill provides guidance for developing with nilDB - Nillion's encrypted NoSQL database that splits data across multiple nodes for enhanced privacy and security.

## When to Use This Skill

Use this skill when the user wants to:
- Store encrypted data in nilDB
- Create and manage collections and schemas
- Query encrypted data across distributed nodes
- Integrate private storage into web applications
- Understand nilDB's encryption and distribution model

## Core Concepts

### What is nilDB?

nilDB provides encrypted NoSQL database nodes supporting:
- **Symmetric cryptography**
- **Homomorphic encryption**
- **Multi-party computation (MPC)**

Data is split across multiple nilDB nodes (typically 3) for enhanced security and availability.

### Architecture

- Distributed across multiple nodes
- Supports mixed encrypted/plaintext document clusters
- RESTful API or Secretvaults SDK access
- Automatic encryption and key management via SDK

## Getting Started

### Prerequisites

1. **Create Nillion Wallet**: https://docs.nillion.com/community/guides/nillion-wallet
2. **Get Testnet NIL Tokens**: https://faucet.testnet.nillion.com/
3. **Subscribe via nilPay**: https://nilpay.vercel.app/ to receive API key
4. **Choose SDK**: TypeScript or Python

### Installation

#### TypeScript/JavaScript

```bash
npm install @nillion/secretvaults
# or
yarn add @nillion/secretvaults
```

#### Python

```bash
pip install secretvaults
```

## SDK Usage

### Important: Use the SDK

**Always use the Secretvaults SDK rather than direct RESTful API calls.** The SDK automatically manages:
- Multiple nilDB node connections
- Encryption/decryption
- Data distribution and orchestration

### TypeScript Examples

#### Initialize Client

```typescript
import { SecretVaultWrapper } from '@nillion/secretvaults';

const client = new SecretVaultWrapper(
  orgConfig.nodes,     // Array of nilDB node configurations
  orgConfig.orgCredentials,  // Organization credentials
  schemaId  // Schema ID for your collection
);

await client.init();
```

#### Create Collection

```typescript
// Define schema first (use Collection Explorer for easy visual creation)
const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UserData",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "_id": { "type": "string", "format": "uuid" },
      "name": { "type": "string" },
      "email": {
        "type": "string",
        // Mark fields for encryption
        "x-nillion": { "encrypt": true }
      },
      "balance": {
        "type": "integer",
        // Enable homomorphic operations
        "x-nillion": { "encrypt": "sum" }
      }
    },
    "required": ["_id", "name"]
  }
};

// Create collection programmatically
await client.createCollection(schema);
```

#### Store Data

```typescript
// Write encrypted data
const data = {
  name: "Alice",
  email: "alice@example.com",  // Will be encrypted
  balance: 1000  // Will support homomorphic sum
};

const result = await client.writeToNodes([data]);
console.log('Stored record IDs:', result.data.created);
```

#### Query Data

```typescript
// Read all records
const records = await client.readFromNodes({});

// Read specific record
const record = await client.readFromNodes({
  _id: "record-uuid-here"
});

// Query with filters (on non-encrypted fields)
const filtered = await client.readFromNodes({
  name: "Alice"
});
```

#### Update Data

```typescript
await client.updateNodes(
  { _id: recordId },  // Filter
  { balance: 1500 }   // Update
);
```

#### Delete Data

```typescript
await client.deleteFromNodes({ _id: recordId });
```

### Python Examples

```python
from secretvaults import SecretVaultWrapper

# Initialize
client = SecretVaultWrapper(
    nodes=org_config['nodes'],
    org_credentials=org_config['org_credentials'],
    schema_id=schema_id
)
await client.init()

# Write data
data = {
    "name": "Bob",
    "email": "bob@example.com",
    "balance": 500
}
result = await client.write_to_nodes([data])

# Read data
records = await client.read_from_nodes({})
```

## Collection Explorer

**Recommended for schema and collection management**: https://collection-explorer.nillion.com

This no-code visual tool allows you to:
- Create and edit schemas visually
- Manage collections
- Browse and modify records
- Configure encryption settings

## Platform Integration

### Next.js (Recommended for Web)

```typescript
// pages/api/store.ts
import { SecretVaultWrapper } from '@nillion/secretvaults';

export default async function handler(req, res) {
  const client = new SecretVaultWrapper(
    JSON.parse(process.env.NILDB_NODES!),
    JSON.parse(process.env.NILDB_CREDENTIALS!),
    process.env.SCHEMA_ID!
  );
  await client.init();

  const result = await client.writeToNodes([req.body]);
  res.json(result);
}
```

### Node.js

```typescript
import { SecretVaultWrapper } from '@nillion/secretvaults';

async function main() {
  const client = new SecretVaultWrapper(nodes, credentials, schemaId);
  await client.init();

  // Use client...
}
```

### React (Client-Side)

Note: For security, API key operations should be server-side. Use React for UI with a backend API.

## Schema Configuration

### Encryption Options

```json
{
  "properties": {
    "publicField": { "type": "string" },
    "encryptedField": {
      "type": "string",
      "x-nillion": { "encrypt": true }
    },
    "summableField": {
      "type": "integer",
      "x-nillion": { "encrypt": "sum" }
    }
  }
}
```

### Collection Types

- **Standard Collections**: Recommended for fullstack apps
- **Owned Collections**: User-specific data with access control

## Integration with BIMP

For the BIMP project, nilDB is used for:
- Storing encrypted payment channel states
- Private routing table information
- Encrypted transaction histories

### Example: Channel State Storage

```typescript
const channelStateSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChannelState",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "_id": { "type": "string", "format": "uuid" },
      "channelId": { "type": "string" },
      "balance": {
        "type": "integer",
        "x-nillion": { "encrypt": "sum" }
      },
      "counterparty": {
        "type": "string",
        "x-nillion": { "encrypt": true }
      },
      "lastUpdate": { "type": "integer" }
    }
  }
};
```

## Documentation Links

- **TypeScript SDK Docs**: https://docs.nillion.com/build/private-storage/ts-docs
- **TypeScript GitHub**: https://github.com/NillionNetwork/secretvaults-ts
- **Python GitHub**: https://github.com/NillionNetwork/secretvaults-py
- **NPM Package**: https://www.npmjs.com/package/@nillion/secretvaults
- **PyPI Package**: https://pypi.org/project/secretvaults
- **Collection Explorer**: https://collection-explorer.nillion.com

### Platform Guides

- **Next.js**: https://docs.nillion.com/build/private-storage/platform-nextjs
- **Node.js**: https://docs.nillion.com/build/private-storage/platform-nodejs
- **React**: https://docs.nillion.com/build/private-storage/platform-react

## Best Practices

1. **Use SDK Over API**: Always prefer Secretvaults SDK for automatic encryption management
2. **Design Schemas Carefully**: Plan encryption needs upfront; changing later requires migration
3. **Server-Side API Keys**: Never expose API keys in client-side code
4. **Standard Collections**: Use for most fullstack applications
5. **Collection Explorer**: Use for initial schema design and testing
6. **Environment Variables**: Store credentials securely

## Troubleshooting

### Common Issues

1. **Connection Errors**: Verify all node URLs and credentials
2. **Encryption Failures**: Check schema `x-nillion` configuration
3. **Query Limitations**: Cannot query on encrypted fields directly
4. **Schema Mismatch**: Ensure data matches schema exactly

### Getting Help

- Check network status: https://status.nillion.com
- Review SDK examples on GitHub
- Use Collection Explorer for debugging
