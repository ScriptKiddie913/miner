import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair } from "./crypto.js";
import { encodeAddress, decodeAddress, isValidAddress, InvalidAddressError } from "./address.js";

test("encodes and decodes a valid mainnet address", () => {
  const { publicKey } = generateKeyPair();
  const addr = encodeAddress(publicKey, "mainnet");
  assert.ok(addr.length > 0);
  const decoded = decodeAddress(addr);
  assert.equal(decoded.network, "mainnet");
});

test("mainnet and testnet addresses differ for the same key", () => {
  const { publicKey } = generateKeyPair();
  const mainnet = encodeAddress(publicKey, "mainnet");
  const testnet = encodeAddress(publicKey, "testnet");
  assert.notEqual(mainnet, testnet);
  assert.equal(decodeAddress(testnet).network, "testnet");
});

test("rejects a tampered checksum", () => {
  const { publicKey } = generateKeyPair();
  const addr = encodeAddress(publicKey, "mainnet");
  const tampered = addr.slice(0, -1) + (addr.at(-1) === "1" ? "2" : "1");
  assert.throws(() => decodeAddress(tampered), InvalidAddressError);
  assert.equal(isValidAddress(tampered), false);
});

test("rejects malformed / garbage addresses", () => {
  assert.equal(isValidAddress("not-an-address"), false);
  assert.equal(isValidAddress(""), false);
  assert.equal(isValidAddress("111111"), false);
});

test("rejects wrong network when a specific network is required", () => {
  const { publicKey } = generateKeyPair();
  const testnetAddr = encodeAddress(publicKey, "testnet");
  assert.equal(isValidAddress(testnetAddr, "mainnet"), false);
  assert.equal(isValidAddress(testnetAddr, "testnet"), true);
});

test("duplicate addresses: same key always yields the same address", () => {
  const { publicKey } = generateKeyPair();
  assert.equal(encodeAddress(publicKey, "mainnet"), encodeAddress(publicKey, "mainnet"));
});
