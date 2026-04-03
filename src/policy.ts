import type {
  PolicyContext,
  PolicyResult,
  ZkKycPolicyConfig,
  ComplianceTier,
  SpendingRecord,
  ComplianceCheckResult,
  ComplianceAttestation,
} from './types';

// ─── Default Configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG: ZkKycPolicyConfig = {
  anonymousThreshold: 100_000,      // $1,000/day — anonymous micropayments
  fullKycThreshold: 1_000_000,      // $10,000/day — requires full KYC credential
  attestationTtl: 90 * 24 * 60 * 60, // 90 days
  solanaRpc: 'https://api.devnet.solana.com',
  network: 'devnet',
  allowStarkProofs: true,
};

// ─── ZK-KYC Policy Engine ────────────────────────────────────────────────────

/**
 * ZK-KYC Policy Engine for Open Wallet Standard
 *
 * Enforces tiered compliance for AI agent wallets:
 * - Below $1,000/day  → Anonymous (no proof required)
 * - $1,000–$10,000    → ZK attestation (innocence proof on-chain, no identity revealed)
 * - Above $10,000/day → Full KYC credential required
 *
 * Uses Protocol-01's Groth16/STARK proof infrastructure on Solana for
 * on-chain verification without exposing agent identity.
 *
 * @example
 * ```typescript
 * const engine = new ZkKycPolicyEngine({
 *   solanaRpc: 'https://api.devnet.solana.com',
 *   network: 'devnet',
 *   allowStarkProofs: true,
 * });
 *
 * // OWS calls this on every signing request
 * const result = await engine.evaluate(policyContext);
 * // { allow: true, reason: 'Anonymous tier: $42.50 of $1,000.00 daily limit used' }
 * ```
 */
export class ZkKycPolicyEngine {
  private config: ZkKycPolicyConfig;
  private spendingTracker: Map<string, SpendingRecord> = new Map();
  private attestationCache: Map<string, ComplianceAttestation> = new Map();

  constructor(config?: Partial<ZkKycPolicyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main OWS policy evaluation — called on every transaction signing request.
   * Returns allow/deny with reason for audit log.
   */
  async evaluate(ctx: PolicyContext): Promise<PolicyResult> {
    const walletId = ctx.wallet.id;
    const estimatedUsd = await this.estimateTransactionValue(ctx);
    const spending = this.getOrCreateSpending(walletId);
    const projectedTotal = spending.totalSpentCents + estimatedUsd;

    // Tier 1: Anonymous — under threshold, no proof needed
    if (projectedTotal <= this.config.anonymousThreshold) {
      this.recordSpend(walletId, estimatedUsd);
      return {
        allow: true,
        reason: `Anonymous tier: $${(projectedTotal / 100).toFixed(2)} of $${(this.config.anonymousThreshold / 100).toFixed(2)} daily limit used`,
        metadata: {
          tier: 'anonymous' as ComplianceTier,
          dailySpentCents: projectedTotal,
          proofRequired: false,
        },
      };
    }

    // Tier 2: Attested — requires valid ZK compliance attestation
    if (projectedTotal <= this.config.fullKycThreshold) {
      const attestation = await this.checkAttestation(walletId);

      if (attestation && attestation.isVerified && !attestation.revoked) {
        const now = Math.floor(Date.now() / 1000);
        if (attestation.expiresAt > now) {
          this.recordSpend(walletId, estimatedUsd);
          return {
            allow: true,
            reason: `Attested tier: valid ZK compliance proof (expires ${new Date(attestation.expiresAt * 1000).toISOString()})`,
            metadata: {
              tier: 'attested' as ComplianceTier,
              dailySpentCents: projectedTotal,
              attestationAddress: attestation.address,
              proofSystem: 'groth16',
            },
          };
        }
      }

      // No valid attestation — deny and request proof generation
      return {
        allow: false,
        reason: `Spending exceeds anonymous limit ($${(this.config.anonymousThreshold / 100).toFixed(2)}/day). ZK compliance attestation required. Generate proof via P01 ComplianceModule.`,
        metadata: {
          tier: 'attested' as ComplianceTier,
          dailySpentCents: projectedTotal,
          proofRequired: true,
          availableProofSystems: this.config.allowStarkProofs ? ['groth16', 'stark'] : ['groth16'],
        },
      };
    }

    // Tier 3: Full KYC required — above maximum threshold
    return {
      allow: false,
      reason: `Daily spending ($${(projectedTotal / 100).toFixed(2)}) exceeds maximum ZK-attested limit ($${(this.config.fullKycThreshold / 100).toFixed(2)}/day). Full KYC credential required.`,
      metadata: {
        tier: 'full_kyc' as ComplianceTier,
        dailySpentCents: projectedTotal,
        proofRequired: true,
      },
    };
  }

  /**
   * Check compliance status for a wallet without executing a transaction.
   */
  async checkCompliance(walletId: string): Promise<ComplianceCheckResult> {
    const spending = this.getOrCreateSpending(walletId);
    const attestation = await this.checkAttestation(walletId);
    const hasValidAttestation = attestation?.isVerified && !attestation.revoked &&
      attestation.expiresAt > Math.floor(Date.now() / 1000);

    let tier: ComplianceTier;
    let allowed: boolean;
    let proofRequired: boolean;
    let reason: string;

    if (spending.totalSpentCents <= this.config.anonymousThreshold) {
      tier = 'anonymous';
      allowed = true;
      proofRequired = false;
      reason = 'Within anonymous daily limit';
    } else if (spending.totalSpentCents <= this.config.fullKycThreshold && hasValidAttestation) {
      tier = 'attested';
      allowed = true;
      proofRequired = false;
      reason = 'Valid ZK attestation on file';
    } else if (spending.totalSpentCents <= this.config.fullKycThreshold) {
      tier = 'attested';
      allowed = false;
      proofRequired = true;
      reason = 'ZK compliance attestation required for this spending level';
    } else {
      tier = 'full_kyc';
      allowed = false;
      proofRequired = true;
      reason = 'Exceeds ZK-attested limit, full KYC required';
    }

    const remainingAllowanceCents = tier === 'anonymous'
      ? this.config.anonymousThreshold - spending.totalSpentCents
      : tier === 'attested' && hasValidAttestation
        ? this.config.fullKycThreshold - spending.totalSpentCents
        : 0;

    return {
      allowed,
      tier,
      reason,
      attestationAddress: attestation?.address,
      remainingAllowanceCents: Math.max(0, remainingAllowanceCents),
      proofRequired,
    };
  }

  /**
   * Register a compliance attestation from Protocol-01's on-chain verification.
   * Called after the agent generates and verifies a ZK proof via ComplianceModule.
   */
  registerAttestation(walletId: string, attestation: ComplianceAttestation): void {
    this.attestationCache.set(walletId, attestation);
  }

  /**
   * Get the current compliance tier for a wallet.
   */
  getTier(walletId: string): ComplianceTier {
    const spending = this.getOrCreateSpending(walletId);
    if (spending.totalSpentCents <= this.config.anonymousThreshold) return 'anonymous';
    if (spending.totalSpentCents <= this.config.fullKycThreshold) return 'attested';
    return 'full_kyc';
  }

  /**
   * Reset daily spending (called at UTC midnight or by external scheduler).
   */
  resetDailySpending(): void {
    this.spendingTracker.clear();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private getOrCreateSpending(walletId: string): SpendingRecord {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${walletId}:${today}`;
    let record = this.spendingTracker.get(key);
    if (!record) {
      record = {
        walletId,
        date: today,
        totalSpentCents: 0,
        txCount: 0,
        tier: 'anonymous',
      };
      this.spendingTracker.set(key, record);
    }
    return record;
  }

  private recordSpend(walletId: string, amountCents: number): void {
    const record = this.getOrCreateSpending(walletId);
    record.totalSpentCents += amountCents;
    record.txCount += 1;
    record.tier = this.getTier(walletId);
  }

  private async checkAttestation(walletId: string): Promise<ComplianceAttestation | null> {
    // Check local cache first
    const cached = this.attestationCache.get(walletId);
    if (cached) return cached;

    // In production: query Solana for ComplianceAttestation PDA
    // const attestationPda = PublicKey.findProgramAddressSync(
    //   [Buffer.from('compliance'), walletPublicKey.toBuffer()],
    //   trustlessProgramId
    // );
    // const accountInfo = await connection.getAccountInfo(attestationPda[0]);
    // ... deserialize and return

    return null;
  }

  /**
   * Estimate transaction value in USD cents from OWS simulation data.
   * Uses balance changes from simulation, falls back to conservative estimate.
   */
  private async estimateTransactionValue(ctx: PolicyContext): Promise<number> {
    if (ctx.simulation?.balanceChanges) {
      let totalUsd = 0;
      for (const change of ctx.simulation.balanceChanges) {
        const diff = Math.abs(Number(change.after) - Number(change.before));
        // Simplified: assume SOL ≈ $150, USDC/USDT = $1
        // Production: use oracle price feed
        if (change.token === 'SOL' || change.token === 'So11111111111111111111111111111111111111112') {
          totalUsd += (diff / 1e9) * 150 * 100; // cents
        } else {
          totalUsd += (diff / 1e6) * 100; // stablecoin cents
        }
      }
      return Math.round(totalUsd);
    }

    // Conservative: if no simulation, assume $50 per transaction
    return 5000;
  }
}
