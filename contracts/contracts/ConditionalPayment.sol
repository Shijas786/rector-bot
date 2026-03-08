// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ConditionalPayment
 * @notice Demo contract that consumes the PredictionRegistry attestation.
 *
 * How it works:
 * 1. Creator deposits BNB + links it to a prediction ID from PredictionRegistry
 * 2. When the prediction resolves TRUE on the registry, winner claims the BNB
 * 3. If it resolves FALSE, creator reclaims their deposit
 * 4. This shows step 5 of the Rector flow:
 *    "Because the attestation lives onchain, any smart contract or app
 *     can consume it instantly"
 *
 * Deploy alongside PredictionRegistry on BSC testnet for demo.
 */

interface IPredictionRegistry {
    enum Status { PENDING, RESOLVED, INCONCLUSIVE, EXPIRED }

    struct Prediction {
        uint256 id;
        address submitter;
        string  claimText;
        string  disambiguated;
        string  runbookRef;
        uint256 resolutionDate;
        Status  status;
        bool    outcome;
        uint8   confidence;
        string  evidenceRef;
        string  reasoning;
        bytes   signature;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    function getPrediction(uint256 _id) external view returns (Prediction memory);
}

contract ConditionalPayment {

    IPredictionRegistry public immutable registry;

    struct Escrow {
        address creator;       // depositor (pays out if prediction FALSE)
        address beneficiary;   // receives BNB if prediction TRUE
        uint256 predictionId;  // ID in PredictionRegistry
        uint256 amount;        // BNB locked
        bool    claimed;
    }

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed creator,
        address indexed beneficiary,
        uint256 predictionId,
        uint256 amount
    );
    event PayoutClaimed(
        uint256 indexed escrowId,
        address indexed claimedBy,
        uint256 amount,
        bool predictionWon
    );

    constructor(address _registry) {
        registry = IPredictionRegistry(_registry);
    }

    /**
     * @notice Creator deposits BNB, betting that prediction #predictionId comes TRUE.
     * @param _predictionId  ID in PredictionRegistry
     * @param _beneficiary   Address that receives BNB if prediction is TRUE
     *
     * Example: "I bet 0.1 BNB that BNB hits $700. If I'm right, pay me. If wrong, refund."
     */
    function createEscrow(
        uint256 _predictionId,
        address _beneficiary
    ) external payable returns (uint256 escrowId) {
        require(msg.value > 0, "Must deposit BNB");
        require(_beneficiary != address(0), "Invalid beneficiary");

        // Verify prediction exists and is still PENDING
        IPredictionRegistry.Prediction memory p = registry.getPrediction(_predictionId);
        require(p.id == _predictionId, "Prediction not found");
        require(p.status == IPredictionRegistry.Status.PENDING, "Prediction not pending");

        escrowId = ++escrowCount;
        escrows[escrowId] = Escrow({
            creator:      msg.sender,
            beneficiary:  _beneficiary,
            predictionId: _predictionId,
            amount:       msg.value,
            claimed:      false
        });

        emit EscrowCreated(escrowId, msg.sender, _beneficiary, _predictionId, msg.value);
    }

    /**
     * @notice Claim payout once the linked prediction is resolved.
     * - If prediction TRUE  → beneficiary receives the BNB
     * - If prediction FALSE → creator gets refund
     * - If INCONCLUSIVE     → creator gets refund
     */
    function claim(uint256 _escrowId) external {
        Escrow storage e = escrows[_escrowId];
        require(!e.claimed, "Already claimed");
        require(
            msg.sender == e.beneficiary || msg.sender == e.creator,
            "Not authorized"
        );

        IPredictionRegistry.Prediction memory p = registry.getPrediction(e.predictionId);
        require(
            p.status == IPredictionRegistry.Status.RESOLVED ||
            p.status == IPredictionRegistry.Status.INCONCLUSIVE,
            "Prediction not resolved yet"
        );

        e.claimed = true;
        uint256 amount = e.amount;

        if (p.status == IPredictionRegistry.Status.RESOLVED && p.outcome) {
            // Prediction TRUE → pay beneficiary
            (bool ok,) = payable(e.beneficiary).call{value: amount}("");
            require(ok, "Transfer failed");
            emit PayoutClaimed(_escrowId, e.beneficiary, amount, true);
        } else {
            // Prediction FALSE or INCONCLUSIVE → refund creator
            (bool ok,) = payable(e.creator).call{value: amount}("");
            require(ok, "Refund failed");
            emit PayoutClaimed(_escrowId, e.creator, amount, false);
        }
    }

    /**
     * @notice Read escrow + linked prediction status in one call (for frontend).
     */
    function getEscrowWithPrediction(uint256 _escrowId)
        external
        view
        returns (Escrow memory escrow, IPredictionRegistry.Prediction memory prediction)
    {
        escrow = escrows[_escrowId];
        prediction = registry.getPrediction(escrow.predictionId);
    }

    /// @notice Allow contract to receive BNB
    receive() external payable {}
}
