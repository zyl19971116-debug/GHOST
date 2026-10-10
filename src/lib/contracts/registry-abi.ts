/** ABI mirrored from contracts/contracts/AnalysisRegistry.sol. */
export const ANALYSIS_REGISTRY_ABI = [
  { type: 'function', name: 'registerAnalysis', stateMutability: 'nonpayable', inputs: [
    { name: 'subject', type: 'address' }, { name: 'reportHash', type: 'bytes32' },
    { name: 'reportVersion', type: 'string' }, { name: 'metadataCid', type: 'string' },
    { name: 'analysisChainId', type: 'uint256' },
  ], outputs: [{ name: 'recordId', type: 'uint256' }] },
  { type: 'function', name: 'registerAnalysisAllowDuplicate', stateMutability: 'nonpayable', inputs: [
    { name: 'subject', type: 'address' }, { name: 'reportHash', type: 'bytes32' },
    { name: 'reportVersion', type: 'string' }, { name: 'metadataCid', type: 'string' },
    { name: 'analysisChainId', type: 'uint256' },
  ], outputs: [{ name: 'recordId', type: 'uint256' }] },
  { type: 'function', name: 'revokeAnalysis', stateMutability: 'nonpayable', inputs: [{ name: 'recordId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'getRecord', stateMutability: 'view', inputs: [{ name: 'recordId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [
    { name: 'publisher', type: 'address' }, { name: 'subject', type: 'address' }, { name: 'analysisChainId', type: 'uint256' },
    { name: 'reportHash', type: 'bytes32' }, { name: 'reportVersion', type: 'string' }, { name: 'metadataCid', type: 'string' },
    { name: 'registeredAt', type: 'uint64' }, { name: 'revoked', type: 'bool' },
  ] }] },
  { type: 'function', name: 'totalRecords', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'event', name: 'AnalysisRegistered', inputs: [
    { name: 'recordId', type: 'uint256', indexed: true }, { name: 'publisher', type: 'address', indexed: true },
    { name: 'subject', type: 'address', indexed: true }, { name: 'analysisChainId', type: 'uint256', indexed: false },
    { name: 'reportHash', type: 'bytes32', indexed: false }, { name: 'reportVersion', type: 'string', indexed: false },
    { name: 'metadataCid', type: 'string', indexed: false }, { name: 'registeredAt', type: 'uint64', indexed: false },
  ], anonymous: false },
  { type: 'event', name: 'AnalysisRevoked', inputs: [
    { name: 'recordId', type: 'uint256', indexed: true }, { name: 'publisher', type: 'address', indexed: true },
    { name: 'revokedAt', type: 'uint64', indexed: false },
  ], anonymous: false },
] as const;

export const RECORD_STATUS = ['NONE', 'ACTIVE', 'REVOKED'] as const;
