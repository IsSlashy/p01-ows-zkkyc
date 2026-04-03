export { ZkKycPolicyEngine } from './policy';
export { generateOWSPolicy, P01_ZKKYC_POLICY_ID } from './adapter';

export type {
  // OWS types
  PolicyContext,
  PolicyResult,
  Policy,
  WalletDescriptor,
  ChainId,
  WalletId,

  // ZK-KYC types
  ZkKycPolicyConfig,
  ComplianceTier,
  ComplianceAttestation,
  ComplianceCheckResult,
  ComplianceProof,
  SpendingRecord,
  ProofSystem,
} from './types';
