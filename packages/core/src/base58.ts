// Standard Bitcoin-style base58 alphabet (excludes 0/O/I/l to avoid
// visual ambiguity). Well-known encoding, not invented here.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) ALPHABET_MAP[ALPHABET[i]] = i;

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) leadingZeros++;
    else break;
  }
  return (
    ALPHABET[0].repeat(leadingZeros) +
    digits
      .reverse()
      .map((d) => ALPHABET[d])
      .join("")
  );
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array();
  let bytes = [0];
  for (const char of str) {
    const value = ALPHABET_MAP[char];
    if (value === undefined) throw new Error(`Invalid base58 character: ${char}`);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (const char of str) {
    if (char === ALPHABET[0]) leadingZeros++;
    else break;
  }
  return new Uint8Array([...Array(leadingZeros).fill(0), ...bytes.reverse()]);
}
