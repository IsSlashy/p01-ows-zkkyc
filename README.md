# P01 ZK-KYC Policy Engine for Open Wallet Standard

**Privacy-preserving compliance for AI agent wallets. No doxxing, no KYC theater — just math.**

> Track 2: Agent Spend Governance & Identity | OWS Hackathon 2026

---

## The Problem

AI agents need wallets. Wallets need compliance. Compliance today means **identity disclosure** — KYC forms, passport scans, selfie checks. This defeats the purpose of autonomous agents and creates massive privacy/security risks:

- Agent operators must doxx themselves for **every wallet** they deploy
- Leaked KYC data becomes an attack vector (see: every exchange hack ever)
- No way to prove compliance **without** revealing who you are
- Current OWS policy engine has **no compliance primitive** — it's either open or closed

## The Solution

**ZK-KYC**: a tiered compliance system that uses **zero-knowledge proofs** to prove compliance without revealing identity.

```
┌──────────────────────────────────────────────────────────────┐
│                    OWS Agent Wallet                          │
│                                                              │
│  Every signing request → P01 ZK-KYC Policy Engine            │
│                                                              │
│  ┌────────────────┬──────────────────┬─────────────────┐     │
│  │   < $1,000/day │  $1K – $10K/day  │   > $10K/day    │     │
│  │   ANONYMOUS    │   ZK ATTESTED    │   FULL KYC      │     │
│  │                │                  │                  │     │
│  │  No proof      │  ZK innocence    │  Credential      │     │
│  │  No identity   │  proof on-chain  │  required         │     │
│  │  Just pay      │  No identity     │                  │     │
│  │                │  revealed        │                  │     │
│  └────────────────┴──────────────────┴─────────────────┘     │
│                                                              │
│  Proofs verified ON-CHAIN on Solana (not by a trusted third  │
│  party). Math replaces trust.                                │
└──────────────────────────────────────────────────────────────┘
```

### How ZK Attestation Works

1. Agent's spending crosses $1,000/day threshold
2. Policy engine **denies** the transaction, requests ZK proof
3. Agent generates a **ZK innocence proof** via Protocol-01:
   - Proves wallet is NOT on the OFAC/EU sanctions list
   - Uses a sorted Merkle tree of sanctioned addresses
   - Proves non-inclusion WITHOUT revealing which address it is
4. Proof is verified **on-chain** on Solana (Groth16 or STARK)
5. On-chain `ComplianceAttestation` PDA is created (valid 90 days)
6. Policy engine sees valid attestation → allows transaction
7. **Zero identity disclosed at any step**

## What's Already Built

This isn't a hackathon prototype. Protocol-01 is a **production-grade privacy infrastructure** for Solana, built over 3+ months as a solo dev project.

### Deployed on Solana Devnet

| Component | Program ID | Status |
|-----------|-----------|--------|
| ZK Shielded Pools | `2w4WRvujjrZYip1dUrp3X4nzoPVWeRZF9KnjtvSstGms` | Live |
| Trustless Verifier | `5x8qr9UwF6BTN4ySb4gPwL4TYgZiiLCzg4mKDmQrnjyJ` | Live |
| STARK Verifier | `EXmAQqmkQmq1vnSmKXY2rnUUrrWHqxddjXaJv8aNEL4Z` | Live |
| Stealth Addresses | `8rywsvheQZPp8efQ4bsZ37J9GWMLY2ER76f3o8opPsYh` | Live |
| Quantum Vault | `9yVr79XkwGabckVxedz4UH78twzkgmGqXHBAX7vfJvYv` | Live |
| Meta-Address Registry | `ET9NrX6RCaNi4Ghr5HsySxMpm4GXQSSw7qZByW5cpLnr` | Live |

[View on Solana Explorer](https://solscan.io/account/2w4WRvujjrZYip1dUrp3X4nzoPVWeRZF9KnjtvSstGms?cluster=devnet)

### ZK Proof Systems

**Groth16 (BN254)** — 6 circuits compiled with trusted setup:
- `confidential_balance` (1,382 constraints)
- `balance_proof` (644 constraints)
- `transfer` (12,222 constraints)
- `denominated_pool` (4,273 constraints)
- `denominated_transfer`
- `subscriber_ownership`

**STARK (Goldilocks field)** — 6 AIR constraints, quantum-resistant:
- All 6 circuits ported from Groth16 to hash-based STARKs
- ~9KB compact proofs (Blake3 Merkle, 16 queries)
- Verified on-chain via custom FRI verifier (no Winterfell dependency)
- **Post-quantum secure** — no elliptic curve assumptions

### Privacy SDK

`@p01/privacy-sdk` — 15 modules, TypeScript:

```
ShieldModule          StealthModule         ConfidentialModule
StreamsModule         SubscriptionsModule   VaultModule
RegistryModule        RelayModule           MPCModule
ComplianceModule      AirdropModule         OTCModule
PayrollModule         TreasuryModule        MugenExchangeModule
```

### Client Applications

- **Website**: [protocol-01.vercel.app](https://protocol-01.vercel.app)
- **Mobile App**: Expo/React Native (Android), 4 tabs, full ZK operations
- **Browser Extension**: Chrome MV3, shielded transactions

## OWS Integration

### Install

```bash
npm install @p01/ows-zkkyc
```

### Usage

```typescript
import { ZkKycPolicyEngine, generateOWSPolicy } from '@p01/ows-zkkyc';

// Create the policy
const policy = generateOWSPolicy({
  anonymousThreshold: 100_000,    // $1,000/day — free, anonymous
  fullKycThreshold: 1_000_000,    // $10,000/day — ZK proof required
  solanaRpc: 'https://api.mainnet-beta.solana.com',
  network: 'mainnet',
  allowStarkProofs: true,         // Accept quantum-resistant proofs
});

// Register with OWS
await ows.policies.register(policy);
await ows.apiKeys.update(agentApiKey, {
  policyIds: [policy.id],
});

// That's it. Every transaction is now compliance-gated.
// Small payments flow freely. Large payments require ZK proofs.
// Zero identity disclosed at any tier.
```

### Policy Evaluation Flow

```
Agent signs transaction
        │
        ▼
OWS Policy Engine calls evaluate(PolicyContext)
        │
        ▼
┌─── Estimate TX value (from simulation) ───┐
│                                            │
│  Daily total < $1K?                        │
│  ├─ YES → ALLOW (anonymous)               │
│  └─ NO → Check attestation                │
│          │                                 │
│          ├─ Valid ZK attestation?           │
│          │  ├─ YES → ALLOW (attested)      │
│          │  └─ NO → DENY (proof required)  │
│          │                                 │
│          └─ Daily total > $10K?            │
│             └─ DENY (full KYC required)    │
└────────────────────────────────────────────┘
        │
        ▼
Result + metadata → OWS audit log
```

### Generating a ZK Proof (Agent-Side)

When the policy denies a transaction and requests a proof:

```typescript
import { PrivacySDK } from '@p01/privacy-sdk';

const sdk = new PrivacySDK({
  connection,
  wallet: agentKeypair,
  network: 'devnet',
});

// Generate ZK innocence proof (not on sanctions list)
const result = await sdk.compliance.proveInnocence({
  sanctionsRoot: currentSanctionsRoot,
  spendingKey: agentSpendingKey,
  lowLeaf, highLeaf,           // Adjacent leaves in sorted Merkle tree
  lowPathIndices, lowPathElements,
  highPathIndices, highPathElements,
});

// Attestation is now on-chain — policy engine will see it
// Valid for 90 days, no renewal needed unless revoked
console.log('Attestation:', result.attestationAddress.toBase58());
```

## Run the Demo

```bash
git clone https://github.com/pmusic-volta/p01-ows-zkkyc
cd p01-ows-zkkyc
npm install
npx tsx src/demo.ts
```

Output shows all 3 scenarios: anonymous payment, ZK-attested payment, and denied whale transaction.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent (OWS Wallet)                   │
│                                                             │
│  ┌─────────────┐    ┌──────────────────┐                    │
│  │ OWS Wallet  │───▶│ P01 ZK-KYC       │                    │
│  │ (AES-256)   │    │ Policy Engine     │                    │
│  └─────────────┘    └────────┬─────────┘                    │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────┐   ┌──────────────┐  ┌─────────────┐
     │ Anonymous   │   │ ZK Proof     │  │ Attestation │
     │ (no proof)  │   │ Generation   │  │ Verification│
     │             │   │              │  │             │
     │ < $1K/day   │   │ Groth16 OR   │  │ On-chain    │
     │ Just pay    │   │ STARK prover │  │ Solana PDA  │
     └────────────┘   └──────┬───────┘  └──────┬──────┘
                              │                │
                              ▼                ▼
                     ┌─────────────────────────────┐
                     │     Solana Blockchain        │
                     │                             │
                     │  ┌───────────────────────┐  │
                     │  │ ComplianceAttestation  │  │
                     │  │ PDA (on-chain proof)   │  │
                     │  │                       │  │
                     │  │ • attestationType      │  │
                     │  │ • isVerified: true     │  │
                     │  │ • expiresAt            │  │
                     │  │ • sanctionsRoot        │  │
                     │  │ • circuitVkHash        │  │
                     │  └───────────────────────┘  │
                     │                             │
                     │  Verified by:               │
                     │  • p01_trustless (Groth16)  │
                     │  • p01_stark_verifier (FRI) │
                     └─────────────────────────────┘
```

## Why This Matters for OWS

1. **OWS has no compliance layer** — this fills the gap between "open wallet" and "regulated economy"
2. **Agents can't do KYC** — they don't have passports. ZK proofs are the only viable compliance path for autonomous entities
3. **On-chain verification** — no trusted third party, no oracle, no server. The Solana program verifies the proof directly
4. **Dual proof system** — Groth16 for speed, STARK for quantum resistance. Future-proofed
5. **Composable** — any OWS wallet can add this policy in one line of code

## Tech Stack

- **Circuits**: Circom 2.2.2 (Groth16/BN254) + Winterfell (STARK/Goldilocks)
- **On-chain**: Anchor 0.32.1, Solana Agave 2.2.14
- **SDK**: TypeScript 5.9, @solana/web3.js 1.98.4
- **Crypto**: snarkjs 0.7.5, poseidon-lite 0.3.0, @noble/hashes 1.7.1
- **Post-quantum**: ML-KEM-768 (stealth addresses), WOTS+ (quantum vault), STARK proofs

## About

Built by **Volta Team** — solo developer, 3+ months of focused development.

- 14 Solana programs deployed on devnet
- 12 ZK circuits (6 Groth16 + 6 STARK)
- 15-module TypeScript SDK
- 3 client applications (mobile, extension, web)
- Full post-quantum migration path

**Website**: [protocol-01.vercel.app](https://protocol-01.vercel.app)

---

*Zero knowledge. Full compliance. No compromise.*
