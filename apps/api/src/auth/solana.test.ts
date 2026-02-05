import assert from "node:assert";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { verifySolanaMessageSignature } from "./solana.js";

// Minimal unit test: signature verification should succeed for correct (address,message,sig)

const kp = nacl.sign.keyPair();
const address = bs58.encode(kp.publicKey);
const message = "polystrat test message";
const msgBytes = new TextEncoder().encode(message);
const sig = nacl.sign.detached(msgBytes, kp.secretKey);
const signatureBase64 = Buffer.from(sig).toString("base64");

assert.equal(
  verifySolanaMessageSignature({ address, message, signatureBase64 }),
  true,
  "expected signature verify to succeed"
);

assert.equal(
  verifySolanaMessageSignature({ address, message: message + "x", signatureBase64 }),
  false,
  "expected signature verify to fail for wrong message"
);

console.log("ok solana signature verify");
