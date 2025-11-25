# nilAI (Private LLMs) Skill

This skill provides guidance for developing with nilAI - Nillion's private LLM inference service that runs models in trusted execution environments with OpenAI-compatible APIs.

## When to Use This Skill

Use this skill when the user wants to:
- Make private LLM inference requests
- Integrate nilAI as an OpenAI drop-in replacement
- Verify cryptographic attestation of AI responses
- Choose appropriate models for their use case
- Build chat applications with privacy guarantees

## Core Concepts

### What is nilAI?

nilAI runs LLMs in trusted execution environments enabling:
- **Private Inference**: Your prompts stay private
- **OpenAI Compatibility**: Drop-in replacement for existing code
- **Cryptographic Attestation**: Signed responses for verification
- **TEE Security**: Hardware-guaranteed privacy

### Key Features

- RESTful API with OpenAI-compatible interface
- Multiple model options
- Response signing and verification
- Streaming support

## Getting Started

### Prerequisites

1. **Create Nillion Wallet**: https://docs.nillion.com/community/guides/nillion-wallet
2. **Get Testnet NIL Tokens**: https://faucet.testnet.nillion.com/
3. **Subscribe via nilPay**: https://nilpay.vercel.app/ for nilAI service
4. **Receive API Key**: After subscription

### Quick Start

```javascript
// nilAI is OpenAI-compatible - use the OpenAI SDK!
import OpenAI from 'openai';

const nilai = new OpenAI({
  apiKey: process.env.NILAI_API_KEY,
  baseURL: 'https://nilai.nillion.com/v1'  // nilAI endpoint
});

const completion = await nilai.chat.completions.create({
  model: 'meta-llama/Llama-3.1-8B-Instruct',
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ]
});

console.log(completion.choices[0].message.content);
```

## API Usage

### Chat Completions

```typescript
import OpenAI from 'openai';

const nilai = new OpenAI({
  apiKey: process.env.NILAI_API_KEY,
  baseURL: 'https://nilai.nillion.com/v1'
});

// Standard chat completion
const response = await nilai.chat.completions.create({
  model: 'meta-llama/Llama-3.1-8B-Instruct',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is Interledger Protocol?' }
  ],
  temperature: 0.7,
  max_tokens: 500
});
```

### Streaming Responses

```typescript
const stream = await nilai.chat.completions.create({
  model: 'meta-llama/Llama-3.1-8B-Instruct',
  messages: [
    { role: 'user', content: 'Explain payment channels.' }
  ],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Python Usage

```python
from openai import OpenAI

nilai = OpenAI(
    api_key=os.environ['NILAI_API_KEY'],
    base_url='https://nilai.nillion.com/v1'
)

response = nilai.chat.completions.create(
    model='meta-llama/Llama-3.1-8B-Instruct',
    messages=[
        {'role': 'user', 'content': 'Hello!'}
    ]
)

print(response.choices[0].message.content)
```

## Available Models

Check the current list of available models:
- **Documentation**: https://docs.nillion.com/build/private-llms/overview#available-models

Common models include:
- `meta-llama/Llama-3.1-8B-Instruct` - Good balance of speed/quality
- Other models may require application for access

**Note**: Model availability may vary. Check documentation for current options and any access requirements.

## Attestation & Verification

### Understanding Attestation

nilAI provides cryptographic attestation with responses, proving:
- Response was generated in TEE
- Model and inputs were not tampered with
- Hardware security guarantees

### Verifying Responses

```typescript
// nilAI responses include attestation metadata
const response = await nilai.chat.completions.create({
  model: 'meta-llama/Llama-3.1-8B-Instruct',
  messages: [{ role: 'user', content: 'Test' }]
});

// Access attestation data (check current API for exact format)
// response may include signature, measurement, etc.
console.log(response);
```

## Integration Patterns

### Pattern 1: Drop-in OpenAI Replacement

```typescript
// Just change the base URL!
const client = new OpenAI({
  apiKey: process.env.NILAI_API_KEY,
  baseURL: 'https://nilai.nillion.com/v1'
});

// All existing OpenAI code works
```

### Pattern 2: Next.js API Route

```typescript
// pages/api/chat.ts
import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';

const nilai = new OpenAI({
  apiKey: process.env.NILAI_API_KEY!,
  baseURL: 'https://nilai.nillion.com/v1'
});

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const completion = await nilai.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    messages
  });

  return NextResponse.json(completion);
}
```

### Pattern 3: Streaming Chat Application

```typescript
// Server-sent events for streaming
export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const stream = await nilai.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    messages,
    stream: true
  });

  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
        controller.close();
      }
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}
```

## Integration with BIMP

For the BIMP project, nilAI is used for:
- Private analysis of payment routing
- Channel rebalancing recommendations
- Risk assessment for payment paths
- Natural language interfaces for node operators

### Example: Private Route Analysis

```typescript
async function analyzeRoutingDecision(
  channelState: object,
  paymentRequest: object
): Promise<string> {
  const nilai = new OpenAI({
    apiKey: process.env.NILAI_API_KEY!,
    baseURL: 'https://nilai.nillion.com/v1'
  });

  const response = await nilai.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    messages: [
      {
        role: 'system',
        content: 'You are a payment routing analyst. Analyze channel states and recommend optimal routing decisions.'
      },
      {
        role: 'user',
        content: `Channel State: ${JSON.stringify(channelState)}\nPayment Request: ${JSON.stringify(paymentRequest)}\n\nRecommend the optimal routing path.`
      }
    ],
    temperature: 0.3  // Lower for more deterministic routing advice
  });

  return response.choices[0].message.content || '';
}
```

### Example: Rebalancing Recommendations

```typescript
async function getRebalancingAdvice(
  nodeChannels: object[]
): Promise<string> {
  const nilai = new OpenAI({
    apiKey: process.env.NILAI_API_KEY!,
    baseURL: 'https://nilai.nillion.com/v1'
  });

  const response = await nilai.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    messages: [
      {
        role: 'system',
        content: 'Analyze payment channels and suggest rebalancing operations to optimize liquidity.'
      },
      {
        role: 'user',
        content: `Current channels:\n${JSON.stringify(nodeChannels, null, 2)}\n\nSuggest rebalancing operations.`
      }
    ]
  });

  return response.choices[0].message.content || '';
}
```

## Documentation Links

- **Overview**: https://docs.nillion.com/build/private-llms/overview
- **Quickstart**: https://docs.nillion.com/build/private-llms/quickstart
- **Usage Guide**: https://docs.nillion.com/build/private-llms/usage
- **Available Models**: https://docs.nillion.com/build/private-llms/overview#available-models

## Best Practices

1. **Server-Side Only**: Never expose API keys in client code
2. **Temperature Settings**: Use lower values (0.1-0.3) for deterministic tasks
3. **System Prompts**: Provide clear context for better responses
4. **Error Handling**: Implement retries for network issues
5. **Streaming for UX**: Use streaming for better user experience in chat apps
6. **Model Selection**: Choose model based on task complexity and speed needs

## Environment Configuration

```env
# .env.local
NILAI_API_KEY=your-api-key-here
NILAI_BASE_URL=https://nilai.nillion.com/v1
```

```typescript
// config.ts
export const nilaiConfig = {
  apiKey: process.env.NILAI_API_KEY!,
  baseURL: process.env.NILAI_BASE_URL || 'https://nilai.nillion.com/v1'
};
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check API key validity and nilPay subscription
2. **Model Not Found**: Verify model name and access permissions
3. **Rate Limits**: Implement exponential backoff
4. **Timeout**: Increase timeout for longer responses

### Error Handling

```typescript
try {
  const response = await nilai.chat.completions.create({...});
} catch (error) {
  if (error.status === 401) {
    console.error('Invalid API key');
  } else if (error.status === 429) {
    console.error('Rate limited, retry after delay');
  } else {
    console.error('nilAI error:', error.message);
  }
}
```

### Getting Help

- Check network status: https://status.nillion.com
- Review quickstart guide for setup issues
- Verify nilPay subscription is active for nilAI

## Comparison with OpenAI

| Feature | OpenAI | nilAI |
|---------|--------|-------|
| API Compatibility | - | Full OpenAI compatibility |
| Privacy | Standard | TEE-protected inference |
| Attestation | No | Cryptographic proof |
| Models | GPT-4, etc. | Llama, others |
| Pricing | Per-token | nilPay subscription |
