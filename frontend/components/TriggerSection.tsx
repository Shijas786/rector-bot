"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Escrow {
  id: number;
  creator: string;
  beneficiary: string;
  amount: string;
  claimed: boolean;
}

interface TriggerSectionProps {
  predictionId: number;
  predictionStatus: string;
  predictionOutcome: boolean;
}

const CONDITIONAL_PAYMENT_ADDRESS = process.env.NEXT_PUBLIC_CONDITIONAL_PAYMENT_ADDRESS || "0xF1071252d1a89F7C31925C83CC8D0bD7b1da229F";
const ABI = [
  "function createEscrow(uint256 _predictionId, address _beneficiary) external payable returns (uint256)",
  "function claim(uint256 _escrowId) external",
  "function escrowCount() external view returns (uint256)",
  "function escrows(uint256 id) external view returns (address creator, address beneficiary, uint256 predictionId, uint256 amount, bool claimed)"
];

export default function TriggerSection({ predictionId, predictionStatus, predictionOutcome }: TriggerSectionProps) {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [isTxPending, setIsTxPending] = useState(false);

  const fetchEscrows = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BSC_RPC);
      const contract = new ethers.Contract(CONDITIONAL_PAYMENT_ADDRESS, ABI, provider);
      const count = await contract.escrowCount();
      const results: Escrow[] = [];
      
      for (let i = 1; i <= Number(count); i++) {
        const e = await contract.escrows(i);
        if (Number(e.predictionId) === predictionId) {
          results.push({
            id: i,
            creator: e.creator,
            beneficiary: e.beneficiary,
            amount: ethers.formatEther(e.amount),
            claimed: e.claimed
          });
        }
      }
      setEscrows(results);
    } catch (err) {
      console.error("Failed to fetch escrows:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrows();
  }, [predictionId]);

  const handleCreateTrigger = async () => {
    if (!window.ethereum) return alert("Please install MetaMask");
    setIsTxPending(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONDITIONAL_PAYMENT_ADDRESS, ABI, signer);
      
      const tx = await contract.createEscrow(predictionId, beneficiary, {
        value: ethers.parseEther(amount)
      });
      await tx.wait();
      setShowCreateModal(false);
      fetchEscrows();
    } catch (err: any) {
      alert("Transaction failed: " + err.message);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleClaim = async (escrowId: number) => {
    if (!window.ethereum) return alert("Please install MetaMask");
    setIsTxPending(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONDITIONAL_PAYMENT_ADDRESS, ABI, signer);
      
      const tx = await contract.claim(escrowId);
      await tx.wait();
      fetchEscrows();
    } catch (err: any) {
      alert("Claim failed: " + err.message);
    } finally {
      setIsTxPending(false);
    }
  };

  return (
    <div className="mb-8">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div className="logic-label" style={{ letterSpacing: "0.2em" }}>TRIGGER (AGENTIC ESCROW)</div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowHowItWorks(true)}>How it works?</button>
      </div>

      <div className="card" style={{ padding: "1.5rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="text-center py-4">Checking for escrows...</div>
        ) : escrows.length === 0 ? (
          <div className="text-center py-8">
            <p className="mb-4" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              No funds escrowed for this claim yet.
            </p>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ New Trigger</button>
          </div>
        ) : (
          <div>
            {escrows.map(e => (
              <div key={e.id} className="escrow-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", color: "var(--yellow)" }}>{e.amount} BNB</div>
                  <div className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    To: {e.beneficiary.substring(0, 6)}...{e.beneficiary.substring(38)}
                  </div>
                </div>
                <div>
                  {e.claimed ? (
                    <span className="btn-badge-dark" style={{ color: "var(--text-muted)", borderColor: "var(--text-muted)" }}>CLAIMED</span>
                  ) : predictionStatus === "PENDING" ? (
                    <span className="btn-badge-dark" style={{ color: "var(--yellow)", borderColor: "var(--yellow)" }}>LOCKING...</span>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => handleClaim(e.id)}>
                      {predictionStatus === "RESOLVED" && predictionOutcome ? "Claim Reward" : "Refund Deposit"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="mt-4 text-center">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(true)}>+ Add More BNB</button>
            </div>
          </div>
        )}
      </div>

      {/* HOW IT WORKS MODAL */}
      {showHowItWorks && (
        <div className="modal-overlay" onClick={() => setShowHowItWorks(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>How Triggers Work</h3>
              <button className="close-btn" onClick={() => setShowHowItWorks(false)}>&times;</button>
            </div>
            <div className="modal-body py-4">
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Triggers let you escrow BNB into a vault contract. When the claim is attested on-chain by the Rector Agent, anyone can permissionlessly execute the trigger to release funds.
              </p>
              <ol className="mono" style={{ fontSize: "0.8rem", lineHeight: "1.8" }}>
                <li>1. Create a trigger — set amount & recipient</li>
                <li>2. BNB is escrowed in the vault contract</li>
                <li>3. Rector Agent verifies the claim on-chain</li>
                <li>4. Attestation is posted to PredictionRegistry</li>
                <li>5. Beneficiary (if TRUE) or Creator (if FALSE) claims funds</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* CREATE TRIGGER MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !isTxPending && setShowCreateModal(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>New Trigger</h3>
              <button className="close-btn" onClick={() => !isTxPending && setShowCreateModal(false)}>&times;</button>
            </div>
            <div className="modal-body py-4">
              <div className="mb-4">
                <label className="logic-label mb-2 block">BENEFICIARY ADDRESS</label>
                <input 
                  type="text" 
                  className="chat-input w-full" 
                  placeholder="0x..." 
                  value={beneficiary}
                  onChange={e => setBeneficiary(e.target.value)}
                  disabled={isTxPending}
                />
              </div>
              <div className="mb-6">
                <label className="logic-label mb-2 block">AMOUNT (BNB)</label>
                <input 
                  type="number" 
                  className="chat-input w-full" 
                  placeholder="0.1" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={isTxPending}
                />
              </div>
              <button 
                className="btn btn-primary w-full" 
                onClick={handleCreateTrigger}
                disabled={isTxPending || !beneficiary || !amount}
              >
                {isTxPending ? "Wait for Wallet..." : "Confirm & Escrow"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
