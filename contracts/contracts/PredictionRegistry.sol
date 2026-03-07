// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PredictionRegistry is AccessControl, ReentrancyGuard {

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    enum Status {
        PENDING,      // submitted + runbook ready
        RESOLVED,     // verified + attested
        INCONCLUSIVE, // could not determine
        EXPIRED       // missed resolution date
    }

    struct Prediction {
        uint256 id;
        address submitter;
        string  claimText;           // raw user input
        string  disambiguated;       // AI normalized
        string  runbookRef;          // BNB Greenfield path
        uint256 resolutionDate;      // unix timestamp
        Status  status;
        bool    outcome;
        uint8   confidence;          // 0-100
        string  evidenceRef;         // BNB Greenfield path
        string  reasoning;           // ≤280 chars onchain
        bytes   signature;           // agent ECDSA signature
        uint256 createdAt;
        uint256 resolvedAt;
    }

    uint256 public count;
    mapping(uint256 => Prediction) public predictions;
    mapping(address => uint256[]) public byAddress;
    mapping(address => uint256) public correctCount;
    mapping(address => uint256) public totalCount;

    event PredictionSubmitted(
        uint256 indexed id,
        address indexed submitter,
        uint256 resolutionDate
    );
    event PredictionResolved(
        uint256 indexed id,
        bool outcome,
        uint8 confidence
    );
    event PredictionInconclusive(uint256 indexed id);

    constructor(address _admin, address _agent) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(AGENT_ROLE, _agent);
    }

    /// @notice TX 1 — Submit claim with generated Agentic Verification runbook reference
    /// @dev OpenClaw Agent calls this after generating the runbook. Agent pays gas.
    function submitWithRunbook(
        string  calldata _claimText,
        string  calldata _disambiguated,
        string  calldata _runbookRef,
        uint256 _resolutionDate,
        address _submitter
    ) external onlyRole(AGENT_ROLE) returns (uint256 id) {
        require(_resolutionDate > block.timestamp, "Future only");
        require(bytes(_claimText).length >= 10, "Too short");

        id = ++count;
        predictions[id] = Prediction({
            id:             id,
            submitter:      _submitter,
            claimText:      _claimText,
            disambiguated:  _disambiguated,
            runbookRef:     _runbookRef,
            resolutionDate: _resolutionDate,
            status:         Status.PENDING,
            outcome:        false,
            confidence:     0,
            evidenceRef:    "",
            reasoning:      "",
            signature:      "",
            createdAt:      block.timestamp,
            resolvedAt:     0
        });

        byAddress[_submitter].push(id);
        totalCount[_submitter]++;
        emit PredictionSubmitted(id, _submitter, _resolutionDate);
    }

    /// @notice TX 2 — Agentic Oracle resolution with Greenfield evidence and ECDSA attestation
    /// @dev OpenClaw Agent calls this on resolution date after executing the runbook. Agent pays gas.
    function resolveAndAttest(
        uint256 _id,
        bool    _outcome,
        uint8   _confidence,
        string  calldata _evidenceRef,
        string  calldata _reasoning,
        bytes   calldata _signature
    ) external onlyRole(AGENT_ROLE) nonReentrant {
        Prediction storage p = predictions[_id];
        require(p.status == Status.PENDING, "Not pending");
        require(block.timestamp >= p.resolutionDate, "Too early");
        require(bytes(_reasoning).length <= 280, "Too long");

        p.outcome     = _outcome;
        p.confidence  = _confidence;
        p.evidenceRef = _evidenceRef;
        p.reasoning   = _reasoning;
        p.signature   = _signature;
        p.status      = Status.RESOLVED;
        p.resolvedAt  = block.timestamp;

        if (_outcome) correctCount[p.submitter]++;
        emit PredictionResolved(_id, _outcome, _confidence);
    }

    /// @notice Mark prediction as inconclusive if sources conflict
    function markInconclusive(
        uint256 _id
    ) external onlyRole(AGENT_ROLE) {
        Prediction storage p = predictions[_id];
        require(p.status == Status.PENDING, "Not pending");
        require(block.timestamp >= p.resolutionDate, "Too early");
        p.status = Status.INCONCLUSIVE;
        emit PredictionInconclusive(_id);
    }

    /// @notice Get full prediction details
    function getPrediction(
        uint256 _id
    ) external view returns (Prediction memory) {
        return predictions[_id];
    }

    /// @notice Get all prediction IDs for an address
    function getByAddress(
        address _addr
    ) external view returns (uint256[] memory) {
        return byAddress[_addr];
    }

    /// @notice Get accuracy stats for an address
    function getAccuracy(
        address _addr
    ) external view returns (uint256 correct, uint256 total) {
        return (correctCount[_addr], totalCount[_addr]);
    }
}
