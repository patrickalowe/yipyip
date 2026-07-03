# Publishing a Plugin

Plugins are distributed from a static registry — the
[TREK-Plugins](https://github.com/mauriceboe/TREK-Plugins) GitHub repo. There is
no upload server and no account: you host your plugin in your own GitHub repo and
list it with a pull request.

## 1. Host your plugin

Put your plugin in a **public GitHub repo** (convention: `trek-plugin-<id>`). It
must contain a `trek-plugin.json` at the root, a built `server/index.js`, a
filled-in `README.md`, and (page/widget) a built `client/`.

## 2. Tag a release

Tag `vX.Y.Z` where `X.Y.Z` **equals** `version` in your manifest. Either attach a
`plugin.zip` release asset, or rely on the GitHub source archive at that commit.

## 3. Validate locally

```bash
npx trek-plugin validate .
```

This runs the exact checks the registry CI runs — a local pass predicts a CI
pass.

## 4. Fork the registry and open a PR

You don't have write access to the registry, so **fork
[TREK-Plugins](https://github.com/mauriceboe/TREK-Plugins)** to your own account,
add your entry there, and open a pull request from your fork back to the
registry's `main` branch.

Add one file, `registry/plugins/<id>.json`:

```jsonc
{
  "id": "flight-tracker",
  "name": "Flight Tracker",
  "author": "Your Name",
  "description": "Live flight status widget.",
  "repo": "you/trek-plugin-flight-tracker",
  "type": "widget",
  "versions": [{
    "version": "1.0.0",
    "gitTag": "v1.0.0",
    "commitSha": "<40-hex commit the tag points at>",
    "downloadUrl": "https://github.com/you/trek-plugin-flight-tracker/releases/download/v1.0.0/plugin.zip",
    "sha256": "<sha256 of that artifact>",
    "minTrekVersion": "3.2.0",
    "apiVersion": 1,
    "nativeModules": false
  }]
}
```

CI validates the entry and the artifact, and the maintainer reviews the source at
the pinned commit before merging.

## What CI enforces

**Entry:** valid schema · `id` matches the filename and is a valid slug ·
reserved namespaces (`trek-`, `official-`) blocked · your `id` is bound to your
GitHub owner on first registration (nobody can repoint it later) · homoglyph
check · the release tag exists and points at the pinned commit · manifest parity
· **the artifact's SHA-256 matches the pin** · **no native binaries** ·
`egress[]` present when `http:outbound` is declared.

**README:** must exist, have the required sections (*What it does / Screenshots /
Permissions / Setup*), contain **at least one screenshot that actually resolves**,
have real content (not the unfilled template), and explain every declared
permission.

## Provenance & integrity

- `commitSha` pins the exact source the maintainer reviewed (git tags are movable).
- `sha256` pins the exact artifact bytes TREK will run (release assets are mutable).

TREK verifies the downloaded bytes against `sha256` and refuses to install on a
mismatch. A `reviewedAt` date on your entry means a maintainer looked at that
exact commit — it is **not** an ongoing guarantee.

## Signing your releases (optional, recommended)

`sha256` proves the bytes are the ones the *registry* vouches for. An author
signature additionally proves the bytes were signed by **you** — so a compromised
registry cannot ship attacker code under your name. TREK verifies the signature
offline (Ed25519, no external service), and pins your key on first install
(trust-on-first-use): a later release signed with a different key is refused until
an admin re-trusts it.

**One-time — create a key:**

```
minisign -G          # writes minisign.key (keep secret) + minisign.pub
```

Put the public key in your registry entry as `authorPublicKey` (the base64 payload
line from `minisign.pub`). It is stable across versions.

**Each release — sign the artifact:**

```
minisign -Sm plugin.zip            # writes plugin.zip.minisig
```

Add the base64 signature line from `plugin.zip.minisig` to that version as
`signature`, next to its `sha256`. Example entry:

```jsonc
{
  "id": "flight-tracker",
  "authorPublicKey": "RWQ…base64 minisign public key…",
  "versions": [{
    "version": "1.2.0",
    "sha256": "3b2a…",
    "signature": "RUR…base64 .minisig payload…"
  }]
}
```

Signing is **opt-in**: an entry without `authorPublicKey`/`signature` installs on
`sha256` alone, exactly as before. But once a plugin has shipped signed, an
*unsigned* update for it is refused — don't drop the signature between versions.

## Updating

Add a new version entry (new `version`/`gitTag`/`commitSha`/`sha256`) to your
plugin file and PR it. Instances see the update on their next registry poll;
updating is always an explicit admin action, and if a new version requests **more**
permissions the admin must re-approve.
