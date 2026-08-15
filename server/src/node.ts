import {
  Block,
  buildGenesisBlock,
  genesisHash,
  UtxoSet,
  Mempool,
  Transaction,
  txId,
  applyBlock,
  validateBlock,
  blockHash,
  computeMerkleRoot,
  mineBlock,
  buildCoinbaseTransaction,
  getBlockReward,
  transactionFee,
} from "@sgk/core";
import { ChainStore } from "./storage.js";
import * as cfg from "./config.js";

export class SgkNode {
  blocks: Block[] = [];
  utxoSet = new UtxoSet();
  mempool = new Mempool();
  store: ChainStore;
  private minerAddress: string | null = null;
  private mining = false;

  constructor(dataDir: string) {
    this.store = new ChainStore(dataDir);
  }

  get tipHash(): string {
    return blockHash(this.blocks[this.blocks.length - 1].header);
  }

  get height(): number {
    return this.blocks.length - 1;
  }

  setMinerAddress(addr: string) {
    this.minerAddress = addr;
  }

  private buildGenesis(): Block {
    const allocations = cfg.GENESIS_ALLOCATION_ADDRESS
      ? [{ address: cfg.GENESIS_ALLOCATION_ADDRESS, amount: cfg.GENESIS_ALLOCATION_AMOUNT }]
      : [];
    return buildGenesisBlock({
      network: cfg.NETWORK_MODE,
      networkId: cfg.NETWORK,
      timestamp: cfg.GENESIS_TIMESTAMP,
      difficulty: cfg.DIFFICULTY,
      allocations,
    });
  }

  async init() {
    await this.store.init();
    const savedBlocks = await this.store.loadBlocks();
    const savedUtxo = await this.store.loadUtxoSnapshot();

    const genesis = this.buildGenesis();

    if (savedBlocks && savedBlocks.length > 0) {
      const savedGenesisHash = blockHash(savedBlocks[0].header);
      if (savedGenesisHash !== genesisHash(genesis)) {
        throw new Error(
          "Stored chain's genesis does not match configured genesis parameters. " +
            "Refusing to start (protocol requires rejecting a chain with an incorrect genesis block)."
        );
      }
      this.blocks = savedBlocks;
      this.utxoSet = savedUtxo ? UtxoSet.fromSnapshot(savedUtxo) : new UtxoSet();
      if (!savedUtxo) {
        // rebuild UTXO set by replaying blocks, in case only blocks.json survived
        for (const b of this.blocks) applyBlock(b, this.utxoSet);
      }
    } else {
      this.blocks = [genesis];
      this.utxoSet = new UtxoSet();
      applyBlock(genesis, this.utxoSet);
      await this.persist();
    }
  }

  async persist() {
    await this.store.saveBlocks(this.blocks);
    await this.store.saveUtxoSnapshot(this.utxoSet.snapshot());
  }

  submitTransaction(tx: Transaction): { accepted: boolean; reason?: string; txId?: string } {
    const result = this.mempool.accept(tx, this.utxoSet);
    if (!result.accepted) return result;
    return { accepted: true, txId: txId(tx) };
  }

  getBlockByHash(hash: string): Block | undefined {
    return this.blocks.find((b) => blockHash(b.header) === hash);
  }

  getBlockByHeight(height: number): Block | undefined {
    return this.blocks[height];
  }

  getTransaction(id: string): { tx: Transaction; blockHash: string; height: number } | undefined {
    for (let h = 0; h < this.blocks.length; h++) {
      const block = this.blocks[h];
      for (const tx of block.transactions) {
        if (txId(tx) === id) return { tx, blockHash: blockHash(block.header), height: h };
      }
    }
    return undefined;
  }

  /** Bounded, synchronous mining attempt — safe to call from an HTTP handler
   *  because it's capped, but for real background mining use runAutoMiner(). */
  attemptMineBlock(maxIterations: number): { minedBlock: boolean; block?: Block; reason?: string } {
    if (!this.minerAddress) return { minedBlock: false, reason: "no miner address configured" };

    const pending = this.mempool.selectForBlock(this.utxoSet, 500);
    const height = this.height + 1;
    let totalFees = 0n;
    for (const tx of pending) totalFees += transactionFee(tx, this.utxoSet);

    const coinbase = buildCoinbaseTransaction(height, getBlockReward(height) + totalFees, this.minerAddress);
    const txs = [coinbase, ...pending];

    const header = mineBlock(
      {
        version: 1,
        previousHash: this.tipHash,
        merkleRoot: computeMerkleRoot(txs),
        timestamp: Math.floor(Date.now() / 1000),
        difficulty: cfg.DIFFICULTY,
      },
      cfg.DIFFICULTY,
      maxIterations
    );

    if (!header) return { minedBlock: false, reason: "no valid nonce found within iteration budget" };

    const block: Block = { header, transactions: txs };
    const validation = validateBlock(block, {
      expectedPreviousHash: this.tipHash,
      expectedHeight: height,
      chainParams: {
        networkId: cfg.NETWORK,
        genesisHash: genesisHash(this.blocks[0]),
        difficulty: cfg.DIFFICULTY,
        maxTimestampDriftSeconds: cfg.MAX_TIMESTAMP_DRIFT_SECONDS,
      },
      utxoSet: this.utxoSet,
    });

    if (!validation.valid) {
      return { minedBlock: false, reason: `mined block failed self-validation: ${validation.reason}` };
    }

    applyBlock(block, this.utxoSet);
    this.blocks.push(block);
    for (const tx of pending) this.mempool.remove(txId(tx));

    return { minedBlock: true, block };
  }

  /** Background auto-miner: mines in small bursts on an interval so it never
   *  blocks the event loop for long, and stops naturally if the process is
   *  spun down by the host (Render free tier) while idle. */
  runAutoMiner(intervalMs = 2000, iterationsPerTick = 200_000) {
    if (this.mining) return;
    this.mining = true;
    setInterval(async () => {
      try {
        const result = this.attemptMineBlock(iterationsPerTick);
        if (result.minedBlock) {
          await this.persist();
          console.log(`[miner] mined block ${this.height} (${blockHash(result.block!.header)})`);
        }
      } catch (err) {
        console.error("[miner] error:", err);
      }
    }, intervalMs);
  }
}
