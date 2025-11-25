# nilCC (Confidential Compute) Skill

This skill provides guidance for developing with nilCC - Nillion's confidential compute platform that runs Docker Compose applications inside trusted execution environments (TEEs) with AMD SEV-SNP hardware security.

## When to Use This Skill

Use this skill when the user wants to:
- Deploy applications to nilCC TEE environments
- Configure Docker Compose workloads for confidential compute
- Verify attestation reports from nilCC nodes
- Understand TEE security guarantees and limitations
- Integrate nilCC with other Nillion services

## Core Concepts

### What is nilCC?

nilCC provides confidential compute nodes that run Docker Compose applications with hardware-guaranteed privacy. Key features:
- **TEE Isolation**: AMD SEV-SNP hardware security
- **Cryptographic Attestation**: Proof of execution integrity
- **Docker Support**: Any Docker Compose application (APIs, databases, ML models, analytics)

### Architecture

- Workloads run in isolated TEE enclaves
- Each workload gets cryptographic attestation
- Volume mounts must use `$FILES` prefix
- No privileged containers allowed

## Getting Started

### Prerequisites

1. **Request API Key**: https://surveys.nillion.com/developers/07089b92-f409-4b65-b825-d61132971869
2. **Prepare Docker Compose**: Configure your application with nilCC constraints

### Deployment Options

1. **nilCC Workload Manager UI**: https://nilcc.nillion.com
   - Visual workload management
   - Easy configuration and monitoring

2. **RESTful API**: Programmatic deployment
   - Full API reference: https://docs.nillion.com/build/compute/api-reference

## Configuration Requirements

### Docker Compose Constraints

```yaml
# Example nilCC-compatible docker-compose.yml
version: '3.8'
services:
  myapp:
    image: myapp:latest
    # No privileged mode allowed
    # privileged: true  # NOT ALLOWED
    volumes:
      # Must use $FILES prefix for volume mounts
      - $FILES/data:/app/data
    environment:
      - APP_ENV=production
```

### Security Restrictions

- **No privileged containers**: Cannot use `privileged: true`
- **Volume restrictions**: All volume mounts must use `$FILES` prefix
- **Network isolation**: Limited external network access

## Attestation

### Retrieving Attestation Reports

Every nilCC workload provides attestation at:
```
/nilcc/api/v2/report
```

### Verifying Attestation

```javascript
// Example: Fetch and verify attestation
const response = await fetch('https://your-workload.nilcc.nillion.com/nilcc/api/v2/report');
const attestation = await response.json();

// Verify the attestation contains:
// - TEE measurement
// - Workload hash
// - Timestamp
// - Hardware security guarantees
```

## Integration with BIMP

For the BIMP project, nilCC is used for:
- TEE attestation of payment routing computations
- Secure execution of channel rebalancing algorithms
- Private computation of routing fees

### Example: Attestation Verification in BIMP

```typescript
interface NilCCAttestation {
  measurement: string;      // TEE measurement hash
  workloadHash: string;     // Docker Compose hash
  timestamp: number;        // Unix timestamp
  signature: string;        // Cryptographic signature
}

async function verifyNilCCAttestation(
  workloadUrl: string
): Promise<NilCCAttestation> {
  const response = await fetch(`${workloadUrl}/nilcc/api/v2/report`);
  if (!response.ok) {
    throw new Error(`Attestation fetch failed: ${response.status}`);
  }
  return response.json();
}
```

## Documentation Links

- **Overview**: https://docs.nillion.com/build/compute/overview
- **Quickstart**: https://docs.nillion.com/build/compute/quickstart
- **Architecture**: https://docs.nillion.com/build/compute/architecture
- **API Reference**: https://docs.nillion.com/build/compute/api-reference
- **Security Limitations**: https://docs.nillion.com/build/compute/limitations
- **Key Terms**: https://docs.nillion.com/build/compute/key-terms

## Common Patterns

### Pattern 1: API Service Deployment

```yaml
version: '3.8'
services:
  api:
    image: my-api:latest
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - NODE_ENV=production
```

### Pattern 2: ML Model Inference

```yaml
version: '3.8'
services:
  inference:
    image: ml-model:latest
    volumes:
      - $FILES/models:/models
    environment:
      - MODEL_PATH=/models/model.bin
```

### Pattern 3: Database with Encryption

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    volumes:
      - $FILES/pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
```

## Troubleshooting

### Common Issues

1. **Deployment Fails**: Check Docker Compose syntax and ensure no privileged containers
2. **Volume Mount Errors**: Ensure all paths use `$FILES` prefix
3. **Attestation Not Available**: Wait for workload to fully initialize

### Getting Help

- Check network status: https://status.nillion.com
- Review security limitations before deployment
- Ensure API key is valid and not expired

## Best Practices

1. **Minimize Container Size**: Smaller images deploy faster in TEE
2. **Use Specific Image Tags**: Avoid `latest` for reproducibility
3. **Log Attestation**: Record attestation reports for audit trails
4. **Health Checks**: Implement health endpoints for monitoring
5. **Secret Management**: Use environment variables or mounted secrets
