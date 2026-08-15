import { Transaction, txId } from "./transaction.js";
import { UtxoSet, validateTransactionAgainstUtxoSet, transactionFee } from "./chain.js";

export class Mempool {
  private txs = new Map<string, Transaction>();

  /** Re-validates against the live UTXO set — a transaction sitting in the
   *  mempool is never assumed valid just because it was accepted earlier. */
  accept(tx: Transaction, utxoSet: UtxoSet): { accepted: boolean; reason?: string } {
    const id = txId(tx);
    if (this.txs.has(id)) return { accepted: false, reason: "already in mempool" };

    // conflicting-input check against everything currently pending
    const incomingKeys = new Set(
      (tx.inputs as any[]).map((i) => `${i.prevTxId}:${i.outputIndex}`)
    );
    for (const pending of this.txs.values()) {
      for (const inp of pending.inputs as any[]) {
        if (incomingKeys.has(`${inp.prevTxId}:${inp.outputIndex}`)) {
          return { accepted: false, reason: "conflicts with a pending transaction" };
        }
      }
    }

    const result = validateTransactionAgainstUtxoSet(tx, utxoSet, new Set());
    if (!result.valid) return { accepted: false, reason: result.reason };

    this.txs.set(id, tx);
    return { accepted: true };
  }

  remove(id: string) {
    this.txs.delete(id);
  }

  has(id: string): boolean {
    return this.txs.has(id);
  }

  size(): number {
    return this.txs.size;
  }

  all(): Transaction[] {
    return [...this.txs.values()];
  }

  /** Selects transactions for the next block, highest fee-rate first. */
  selectForBlock(utxoSet: UtxoSet, maxCount: number): Transaction[] {
    const withFees = this.all().map((tx) => ({ tx, fee: transactionFee(tx, utxoSet) }));
    withFees.sort((a, b) => (b.fee > a.fee ? 1 : b.fee < a.fee ? -1 : 0));
    return withFees.slice(0, maxCount).map((w) => w.tx);
  }
}
