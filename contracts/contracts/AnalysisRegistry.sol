// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AnalysisRegistry
 * @notice Optional, opt-in on-chain attestation of wallet-analysis results produced
 *         by GHOST PROTOCOL AI.
 *
 * SCOPE — WHAT THIS CONTRACT IS
 * -----------------------------
 * A minimal, append-only notary. It lets whoever produced an analysis write down:
 *   - the keccak256 hash of the analysis report,
 *   - the report schema version,
 *   - the chain the analysis was performed on,
 *   - the wallet the analysis is about,
 *   - an optional metadata pointer (IPFS CID for the small public metadata blob),
 *   - the block timestamp.
 *
 * SCOPE — WHAT THIS CONTRACT IS DELIBERATELY *NOT*
 * ------------------------------------------------
 *   - It is NOT a token. There is no mint, no supply, no transferable asset.
 *   - It is NOT a custody or transfer contract. It cannot move, hold, wrap, or
 *     proxy value of any kind. There is no `payable` function and no `call`.
 *   - It is NOT a yield, reward, staking, or revenue-share mechanism of any sort.
 *   - It does NOT store report contents. Only a 32-byte hash is written, and only
 *     if the report publisher chose to publish it. The full report never touches
 *     this contract, so nothing sensitive can leak from it.
 *   - It is NOT an identity claim. Registering an analysis about an address does
 *     not assert that the registrant controls that address or that two addresses
 *     share an owner. See `DISCLAIMER` below.
 *
 * Only the registrant's own authorisation is required, and registration is
 * entirely voluntary. Anyone may register, revoke, or simply never use it.
 *
 * DISCLAIMER
 * ----------
 * A record proves one thing only: that a particular hash existed and was
 * submitted by a particular address at a particular time. It is *evidence of
 * publication*, not evidence of accuracy, ownership, or control. Correlation in
 * on-chain data is not proof of common control.
 */
contract AnalysisRegistry {
    /// @notice Maximum length accepted for the free-form metadata pointer.
    uint256 public constant MAX_CID_LENGTH = 128;
    /// @notice Maximum length accepted for the report version string.
    uint256 public constant MAX_VERSION_LENGTH = 32;

    struct Record {
        /// @dev Address that submitted this attestation (the publisher).
        address publisher;
        /// @dev Wallet address the analysis is about.
        address subject;
        /// @dev Chain ID the analysis was executed against.
        uint256 analysisChainId;
        /// @dev keccak256 of the canonical serialised report.
        bytes32 reportHash;
        /// @dev Report schema version, e.g. "1.0.0".
        string reportVersion;
        /// @dev Optional metadata pointer (IPFS CID, or empty).
        string metadataCid;
        /// @dev Block timestamp at registration.
        uint64 registeredAt;
        /// @dev True once the publisher has revoked the attestation.
        bool revoked;
    }

    /// @dev Monotonic record counter. Record ids are 1-based; id 0 never exists.
    uint256 private _recordCount;

    mapping(uint256 => Record) private _records;
    /// @dev recordId => publisher that may revoke it.
    mapping(uint256 => address) public recordPublisher;
    /// @dev subject => list of record ids about that subject.
    mapping(address => uint256[]) private _recordsBySubject;
    /// @dev publisher => list of record ids they submitted.
    mapping(address => uint256[]) private _recordsByPublisher;
    /// @dev reportHash => true once registered, to make duplicates discoverable.
    mapping(bytes32 => bool) public hashRegistered;

    event AnalysisRegistered(
        uint256 indexed recordId,
        address indexed publisher,
        address indexed subject,
        uint256 analysisChainId,
        bytes32 reportHash,
        string reportVersion,
        string metadataCid,
        uint64 registeredAt
    );

    event AnalysisRevoked(uint256 indexed recordId, address indexed publisher, uint64 revokedAt);

    error ZeroSubject();
    error ZeroReportHash();
    error VersionTooLong();
    error CidTooLong();
    error UnknownRecord(uint256 recordId);
    error NotPublisher(uint256 recordId);
    error AlreadyRevoked(uint256 recordId);
    error DuplicateReportHash(bytes32 reportHash);

    /**
     * @notice Register an attestation for an analysis performed against `subject`.
     * @dev Callable by anyone. The caller becomes the publisher and is the only
     *      address able to revoke the record later.
     * @param subject          Wallet address the analysis is about.
     * @param reportHash       keccak256 of the canonical report payload.
     * @param reportVersion    Report schema version string (<= 32 bytes).
     * @param metadataCid      Optional metadata pointer, empty string allowed (<= 128 bytes).
     * @param analysisChainId  Chain ID the analysis was executed against.
     * @return recordId        The newly assigned, 1-based record id.
     */
    function registerAnalysis(
        address subject,
        bytes32 reportHash,
        string calldata reportVersion,
        string calldata metadataCid,
        uint256 analysisChainId
    ) external returns (uint256 recordId) {
        return _register(subject, reportHash, reportVersion, metadataCid, analysisChainId, false);
    }

    /**
     * @notice Register an attestation, tolerating a hash that was already written.
     * @dev Convenience wrapper for pipelines that retry and may re-submit the same
     *      report hash. Identical semantics otherwise.
     */
    function registerAnalysisAllowDuplicate(
        address subject,
        bytes32 reportHash,
        string calldata reportVersion,
        string calldata metadataCid,
        uint256 analysisChainId
    ) external returns (uint256 recordId) {
        return _register(subject, reportHash, reportVersion, metadataCid, analysisChainId, true);
    }

    function _register(
        address subject,
        bytes32 reportHash,
        string calldata reportVersion,
        string calldata metadataCid,
        uint256 analysisChainId,
        bool allowDuplicate
    ) private returns (uint256 recordId) {
        if (subject == address(0)) revert ZeroSubject();
        if (reportHash == bytes32(0)) revert ZeroReportHash();
        if (bytes(reportVersion).length > MAX_VERSION_LENGTH) revert VersionTooLong();
        if (bytes(metadataCid).length > MAX_CID_LENGTH) revert CidTooLong();
        if (!allowDuplicate && hashRegistered[reportHash]) revert DuplicateReportHash(reportHash);

        unchecked {
            _recordCount += 1;
        }
        recordId = _recordCount;

        uint64 nowTs = uint64(block.timestamp);

        _records[recordId] = Record({
            publisher: msg.sender,
            subject: subject,
            analysisChainId: analysisChainId,
            reportHash: reportHash,
            reportVersion: reportVersion,
            metadataCid: metadataCid,
            registeredAt: nowTs,
            revoked: false
        });

        recordPublisher[recordId] = msg.sender;
        hashRegistered[reportHash] = true;
        _recordsBySubject[subject].push(recordId);
        _recordsByPublisher[msg.sender].push(recordId);

        emit AnalysisRegistered(
            recordId,
            msg.sender,
            subject,
            analysisChainId,
            reportHash,
            reportVersion,
            metadataCid,
            nowTs
        );
    }

    /**
     * @notice Revoke an attestation you published.
     * @dev Revocation is a soft flag. The original record and its event stay on
     *      chain forever — that is the point of an append-only notary. Revoking
     *      only marks that the publisher no longer stands behind the record.
     */
    function revokeAnalysis(uint256 recordId) external {
        Record storage rec = _records[recordId];
        if (rec.publisher == address(0)) revert UnknownRecord(recordId);
        if (rec.publisher != msg.sender) revert NotPublisher(recordId);
        if (rec.revoked) revert AlreadyRevoked(recordId);

        rec.revoked = true;
        emit AnalysisRevoked(recordId, msg.sender, uint64(block.timestamp));
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    /// @notice Total number of records ever registered.
    function totalRecords() external view returns (uint256) {
        return _recordCount;
    }

    /// @notice True when `recordId` has been assigned.
    function recordExists(uint256 recordId) external view returns (bool) {
        return _records[recordId].publisher != address(0);
    }

    /// @notice Full record payload. Reverts for unknown ids.
    function getRecord(uint256 recordId) external view returns (Record memory) {
        Record memory rec = _records[recordId];
        if (rec.publisher == address(0)) revert UnknownRecord(recordId);
        return rec;
    }

    /// @notice Number of records registered about `subject`.
    function subjectRecordCount(address subject) external view returns (uint256) {
        return _recordsBySubject[subject].length;
    }

    /// @notice Paginated record ids registered about `subject`, newest first.
    function recordsBySubject(address subject, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory page, uint256 total)
    {
        return _pageDescending(_recordsBySubject[subject], offset, limit);
    }

    /// @notice Number of records submitted by `publisher`.
    function publisherRecordCount(address publisher) external view returns (uint256) {
        return _recordsByPublisher[publisher].length;
    }

    /// @notice Paginated record ids submitted by `publisher`, newest first.
    function recordsByPublisher(address publisher, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory page, uint256 total)
    {
        return _pageDescending(_recordsByPublisher[publisher], offset, limit);
    }

    function _pageDescending(uint256[] storage ids, uint256 offset, uint256 limit)
        private
        view
        returns (uint256[] memory page, uint256 total)
    {
        total = ids.length;
        if (offset >= total || limit == 0) {
            return (new uint256[](0), total);
        }
        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            // Newest first: walk the storage array from the tail.
            page[i] = ids[total - 1 - offset - i];
        }
    }
}
