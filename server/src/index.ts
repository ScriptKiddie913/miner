import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bytesToHex,
  hexToBytes,
  generateKeyPair,
  encodeAddress,
  isValidAddress,
  blockHash,
  txId,
  buildTransaction,
  validateTransactionStructure,
  Transaction,
} from "@sgk/core";
import { SgkNode } from "./node.js";
import * as cfg from "./config.js";

function serializeBigints(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigints);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeBigints(v);
    return out;
  }
  return value;
}

async function loadOrCreateMinerWallet(dataDir: string): Promise<string> {
  if (process.env.SGK_MINER_ADDRESS) return process.env.SGK_MINER_ADDRESS;

  const walletFile = path.join(dataDir, "miner-wallet.json");
  try {
    const raw = await fs.readFile(walletFile, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.address;
  } catch {
    const kp = generateKeyPair();
    const address = encodeAddress(kp.publicKey, cfg.NETWORK_MODE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      walletFile,
      JSON.stringify(
        {
          address,
          privateKey: bytesToHex(kp.privateKey),
          warning:
            "DEMO/DEVNET CONVENIENCE WALLET ONLY. This key is stored in plaintext on disk " +
            "so the node has somewhere to send block rewards on first boot. Never use this " +
            "pattern for real funds — set SGK_MINER_ADDRESS instead to mine to your own wallet.",
        },
        null,
        2
      )
    );
    console.warn(
      `[node] No SGK_MINER_ADDRESS set — generated a devnet convenience miner wallet: ${address}`
    );
    return address;
  }
}

async function main() {
  const node = new SgkNode(cfg.DATA_DIR);
  await node.init();

  const minerAddress = await loadOrCreateMinerWallet(cfg.DATA_DIR);
  node.setMinerAddress(minerAddress);

  if (cfg.AUTO_MINE) {
    node.runAutoMiner();
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // simple in-memory rate limiter (per-IP, per-minute) for mutating endpoints
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  function rateLimit(max: number) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip ?? "unknown";
      const now = Date.now();
      const bucket = rateBuckets.get(ip);
      if (!bucket || now > bucket.resetAt) {
        rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
        return next();
      }
      if (bucket.count >= max) {
        return res.status(429).json({ error: "rate limit exceeded, try again shortly" });
      }
      bucket.count++;
      next();
    };
  }

  app.get("/api/status", (_req, res) => {
    res.json({
      network: cfg.NETWORK,
      height: node.height,
      tipHash: node.tipHash,
      mempoolSize: node.mempool.size(),
      autoMining: cfg.AUTO_MINE,
    });
  });

  app.get("/api/blockchain/info", (_req, res) => {
    const genesis = node.blocks[0];
    res.json(
      serializeBigints({
        network: cfg.NETWORK,
        genesisHash: blockHash(genesis.header),
        height: node.height,
        tipHash: node.tipHash,
        difficulty: cfg.DIFFICULTY,
        blockCount: node.blocks.length,
        mempoolSize: node.mempool.size(),
      })
    );
  });

  app.get("/api/blocks/latest", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const latest = node.blocks.slice(-limit).reverse();
    res.json(
      serializeBigints(
        latest.map((b) => ({
          hash: blockHash(b.header),
          height: node.blocks.indexOf(b),
          timestamp: b.header.timestamp,
          txCount: b.transactions.length,
          difficulty: b.header.difficulty,
        }))
      )
    );
  });

  app.get("/api/block/height/:height", (req, res) => {
    const block = node.getBlockByHeight(Number(req.params.height));
    if (!block) return res.status(404).json({ error: "block not found" });
    res.json(serializeBigints({ hash: blockHash(block.header), ...block }));
  });

  app.get("/api/block/:hash", (req, res) => {
    const block = node.getBlockByHash(req.params.hash);
    if (!block) return res.status(404).json({ error: "block not found" });
    res.json(serializeBigints({ hash: blockHash(block.header), ...block }));
  });

  app.get("/api/tx/:txid", (req, res) => {
    const found = node.getTransaction(req.params.txid);
    if (!found) return res.status(404).json({ error: "transaction not found" });
    res.json(serializeBigints({ id: req.params.txid, ...found }));
  });

  app.get("/api/address/:address", (req, res) => {
    if (!isValidAddress(req.params.address)) {
      return res.status(400).json({ error: "invalid address" });
    }
    const balance = node.utxoSet.balanceOf(req.params.address);
    const utxos = node.utxoSet.utxosFor(req.params.address);
    res.json(serializeBigints({ address: req.params.address, balance, utxoCount: utxos.length, utxos }));
  });

  app.get("/api/address/:address/balance", (req, res) => {
    if (!isValidAddress(req.params.address)) {
      return res.status(400).json({ error: "invalid address" });
    }
    res.json(serializeBigints({ address: req.params.address, balance: node.utxoSet.balanceOf(req.params.address) }));
  });

  app.get("/api/mempool", (_req, res) => {
    res.json(
      serializeBigints(node.mempool.all().map((tx) => ({ txId: txId(tx), ...tx })))
    );
  });

  app.post("/api/tx", rateLimit(30), (req, res) => {
    try {
      const tx = req.body as Transaction;
      // amounts arrive as strings over JSON; convert back to bigint
      tx.outputs = tx.outputs.map((o: any) => ({ ...o, amount: BigInt(o.amount) }));

      const structural = validateTransactionStructure(tx);
      if (!structural.valid) return res.status(400).json({ error: structural.reason });

      const result = node.submitTransaction(tx);
      if (!result.accepted) return res.status(400).json({ error: result.reason });

      broadcast({ type: "new_transaction", txId: result.txId });
      res.json({ accepted: true, txId: result.txId });
    } catch (err: any) {
      res.status(400).json({ error: `malformed transaction: ${err.message}` });
    }
  });

  app.post("/api/mine", rateLimit(6), (req, res) => {
    const maxIterations = Math.min(Number(req.body?.maxIterations ?? 2_000_000), 10_000_000);
    const result = node.attemptMineBlock(maxIterations);
    if (result.minedBlock) {
      node.persist();
      broadcast({ type: "new_block", height: node.height, hash: blockHash(result.block!.header) });
      res.json(serializeBigints({ mined: true, height: node.height, block: result.block }));
    } else {
      res.json({ mined: false, reason: result.reason });
    }
  });

  if (cfg.FAUCET_ENABLED) {
    app.post("/api/faucet", rateLimit(5), async (req, res) => {
      const address = req.body?.address;
      if (typeof address !== "string" || !isValidAddress(address, cfg.NETWORK_MODE)) {
        return res.status(400).json({ error: `invalid ${cfg.NETWORK_MODE} address` });
      }
      const log = await node.store.loadFaucetLog();
      const last = log[address] ?? 0;
      const now = Math.floor(Date.now() / 1000);
      if (now - last < cfg.FAUCET_COOLDOWN_SECONDS) {
        return res.status(429).json({
          error: "faucet cooldown active",
          retryAfterSeconds: cfg.FAUCET_COOLDOWN_SECONDS - (now - last),
        });
      }

      // Faucet funds itself from the miner address's own spendable UTXOs.
      const minerUtxos = node.utxoSet.utxosFor(minerAddress);
      if (minerUtxos.length === 0) {
        return res.status(503).json({ error: "faucet has no funds yet — wait for a block to be mined" });
      }
      const minerWalletRaw = await fs.readFile(path.join(cfg.DATA_DIR, "miner-wallet.json"), "utf-8").catch(() => null);
      if (!minerWalletRaw) {
        return res.status(503).json({ error: "faucet unavailable: SGK_MINER_ADDRESS was set externally, no local signing key" });
      }
      const minerWallet = JSON.parse(minerWalletRaw);
      const privateKey = hexToBytes(minerWallet.privateKey);
      const { publicKeyFromPrivate } = await import("@sgk/core");
      const pubKey = publicKeyFromPrivate(privateKey);

      let remaining = cfg.FAUCET_AMOUNT;
      const chosen: typeof minerUtxos = [];
      let total = 0n;
      for (const u of minerUtxos) {
        chosen.push(u);
        total += u.amount;
        if (total >= remaining + 1_000_000n) break; // leave room for a small fee
      }
      if (total < remaining) {
        return res.status(503).json({ error: "faucet balance too low right now" });
      }

      const change = total - remaining - 1_000_000n; // 0.01 SGK flat fee
      const outputs = [{ amount: remaining, address }];
      if (change > 0n) outputs.push({ amount: change, address: minerAddress });

      const tx = buildTransaction({
        inputsToSpend: chosen.map((u) => ({ ...u, address: minerAddress })),
        outputs,
        privateKey,
        publicKey: pubKey,
      });

      const result = node.submitTransaction(tx);
      if (!result.accepted) return res.status(500).json({ error: `faucet tx rejected: ${result.reason}` });

      log[address] = now;
      await node.store.saveFaucetLog(log);
      broadcast({ type: "new_transaction", txId: result.txId });

      res.json({ txId: result.txId, amount: remaining.toString(), network: cfg.NETWORK });
    });
  } else {
    app.post("/api/faucet", (_req, res) => {
      res.status(403).json({ error: "faucet is disabled on this network (mainnet, or explicitly turned off)" });
    });
  }

  const server = app.listen(cfg.PORT, () => {
    console.log(`[node] SGK node listening on :${cfg.PORT} (network=${cfg.NETWORK}, difficulty=${cfg.DIFFICULTY})`);
    console.log(`[node] height=${node.height} tip=${node.tipHash}`);
  });

  const wss = new WebSocketServer({ server, path: "/api/ws" });
  function broadcast(payload: unknown) {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(msg);
    });
  }

  process.on("SIGTERM", async () => {
    await node.persist();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
