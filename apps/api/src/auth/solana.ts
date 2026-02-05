import nacl from "tweetnacl";
import bs58 from "bs58";

export function verifySolanaMessageSignature(params: { address: string; message: string; signatureBase64: string }): boolean {
  const pubkeyBytes = bs58.decode(params.address);
  const msgBytes = new TextEncoder().encode(params.message);
  const sigBytes = Buffer.from(params.signatureBase64, "base64");
  return nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
}
