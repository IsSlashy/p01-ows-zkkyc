import type { Policy, ZkKycPolicyConfig } from './types';
import { ZkKycPolicyEngine } from './policy';

/** Unique policy ID for P01 ZK-KYC within OWS */
export const P01_ZKKYC_POLICY_ID = 'p01-zkkyc-compliance';

/**
 * Generate an OWS-compatible policy definition that plugs into the
 * Open Wallet Standard policy engine.
 *
 * @example
 * ```typescript
 * import { generateOWSPolicy } from '@p01/ows-zkkyc';
 *
 * // Register with OWS
 * const policy = generateOWSPolicy({
 *   anonymousThreshold: 100_000,  // $1,000/day free
 *   solanaRpc: process.env.SOLANA_RPC!,
 *   network: 'mainnet',
 * });
 *
 * // Add to OWS API key
 * await ows.apiKeys.update(apiKeyId, {
 *   policyIds: [...existing, policy.id],
 * });
 * ```
 */
export function generateOWSPolicy(
  config?: Partial<ZkKycPolicyConfig>,
): Policy & { engine: ZkKycPolicyEngine } {
  const engine = new ZkKycPolicyEngine(config);

  return {
    id: P01_ZKKYC_POLICY_ID,
    name: 'P01 ZK-KYC Compliance',
    executable: '@p01/ows-zkkyc',
    config: config as Record<string, unknown>,
    action: 'deny',
    engine,
  };
}
