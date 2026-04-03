// ─── OWS Standard Types (from Open Wallet Standard spec) ─────────────────────

/** CAIP-2 chain identifier */
export type ChainId = string;

/** OWS wallet identifier */
export type WalletId = string;

/** OWS wallet descriptor */
export interface WalletDescriptor {
  id: WalletId;
  name: string;
  createdAt: string;
  chainType: string;
  accounts: AccountDescriptor[];
  metadata: Record<string, unknown>;
}

export interface AccountDescriptor {
  address: string;
  chainId: ChainId;
  derivationPath?: string;
}

/** OWS serialized transaction */
export interface SerializedTransaction {
  data: string;
  encoding: 'base64' | 'hex';
  chainId: ChainId;
}

/** OWS simulation result */
export interface SimulationResult {
  success: boolean;
  balanceChanges?: BalanceChange[];
  logs?: string[];
}

export interface BalanceChange {
  address: string;
  token: string;
  before: string;
  after: string;
}

// ─── OWS Policy Interface ────────────────────────────────────────────────────

/** Context passed to every OWS policy on each signing request */
export interface PolicyContext {
  transaction: SerializedTransaction;
  chainId: ChainId;
  wallet: WalletDescriptor;
  simulation?: SimulationResult;
  timestamp: string;
  apiKeyId: string;
}

/** Result returned by the policy engine */
export interface PolicyResult {
  allow: boolean;
  reason?: string;
  /** Metadata attached to audit log entry */
  metadata?: Record<string, unknown>;
}

/** OWS policy definition */
export interface Policy {
  id: string;
  name: string;
  executable: string;
  config?: Record<string, unknown>;
  action: 'deny' | 'warn';
}

// ─── ZK-KYC Policy Types ─────────────────────────────────────────────────────

/** Compliance tier based on daily spending volume */
export type ComplianceTier = 'anonymous' | 'attested' | 'full_kyc';

/** ZK-KYC policy configuration */
export interface ZkKycPolicyConfig {
  /** Daily spending threshold for anonymous tier (in USD cents). Default: 100000 ($1,000) */
  anonymousThreshold: number;
  /** Daily spending threshold requiring full KYC (in USD cents). Default: 1000000 ($10,000) */
  fullKycThreshold: number;
  /** Attestation TTL in seconds. Default: 7776000 (90 days) */
  attestationTtl: number;
  /** Solana RPC endpoint for on-chain verification */
  solanaRpc: string;
  /** Network: devnet or mainnet */
  network: 'devnet' | 'mainnet';
  /** Allow STARK proofs (quantum-resistant) alongside Groth16 */
  allowStarkProofs: boolean;
}

/** On-chain compliance attestation (cached locally after first proof) */
export interface ComplianceAttestation {
  /** PDA address on Solana */
  address: string;
  /** Wallet that owns this attestation */
  walletAddress: string;
  /** Type of compliance proof */
  attestationType: 'range' | 'innocence';
  /** Whether on-chain verifier confirmed the proof */
  isVerified: boolean;
  /** Unix timestamp when issued */
  issuedAt: number;
  /** Unix timestamp when it expires */
  expiresAt: number;
  /** Whether revoked by authority */
  revoked: boolean;
  /** Sanctions Merkle root at time of proof */
  sanctionsRoot?: string;
  /** Threshold used in the proof */
  threshold: string;
}

/** Daily spending tracker per wallet */
export interface SpendingRecord {
  walletId: WalletId;
  /** UTC date string (YYYY-MM-DD) */
  date: string;
  /** Total spent today in USD cents */
  totalSpentCents: number;
  /** Number of transactions */
  txCount: number;
  /** Current compliance tier */
  tier: ComplianceTier;
}

/** Result of a ZK-KYC compliance check */
export interface ComplianceCheckResult {
  allowed: boolean;
  tier: ComplianceTier;
  reason: string;
  /** If attestation required, the on-chain attestation address */
  attestationAddress?: string;
  /** Remaining daily allowance in USD cents */
  remainingAllowanceCents: number;
  /** Whether a new proof needs to be generated */
  proofRequired: boolean;
}

/** Supported proof systems */
export type ProofSystem = 'groth16' | 'stark';

/** Proof submission for compliance verification */
export interface ComplianceProof {
  system: ProofSystem;
  /** For Groth16: pi_a, pi_b, pi_c */
  proof: unknown;
  /** Public signals / inputs */
  publicInputs: string[];
  /** Circuit identifier */
  circuitId: string;
}
