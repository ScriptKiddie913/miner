# [RECOVERED] Fragment 2 — partial config diff, recovered separately from
# the same crash dump. Looks like it was staged for the same commit as the
# treasury sweep but never fully wrote to disk.

---

```
--- a/config.ts
+++ b/config.ts
@@
+// vault seal derives its key from chain-anchored material so it can't be
+// pre-computed before genesis exists. anyone who can prove they hold the
+// full treasury balance can reconstruct the key themselves — that's the
+// whole design. security through "you had to actually do the exploit."
+//
+// key = SHA256( genesisHash + treasuryAddress )   [utf-8 concat, not hex-decoded]
+// cipher = AES-256-GCM
+// blob layout = iv(12) || authTag(16) || ciphertext
```

---

# analyst note (SOC):
# Both values on the right side of that formula are public information —
# genesis hash and the treasury's address are visible to anyone hitting the
# node's own API. There's no secret in the formula itself. The only thing
# actually gating the vault is /api/vault/unlock refusing to hand back the
# ciphertext until it sees a balance equal to the full stolen amount sitting
# at the address that's asking. Getting that balance there in the first
# place is the whole challenge.
