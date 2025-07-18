# Cloak Desktop

## Summary

Cloak integrates directly with [Oxen Service Nodes](https://docs.oxen.io/about-the-oxen-blockchain/oxen-service-nodes), which are a set of distributed, decentralized, and Sybil-resistant nodes. Service Nodes act as servers to store messages offline, and as a set of nodes providing onion routing to obfuscate user IP addresses.
For a full understanding of how the original system works, see the [Session Whitepaper](https://getsession.org/whitepaper).

<br/>
<br/>
<img src="https://i.imgur.com/ydVhH00.png" alt="Screenshot of Cloak Desktop" />

## Want to Contribute? Found a Bug or Have a Feature Request?

Please search for any [existing issues](https://github.com/session-foundation/session-desktop/issues) that describe your bug or feature request to avoid duplicate submissions.

Submissions can be made by creating a pull request to our development branch. If you’re unsure where to start contributing, read [Contributing.md](CONTRIBUTING.md) and check issues tagged with the [good-first-issue](https://github.com/session-foundation/session-desktop/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) label.

## Supported Platforms

Check Cloak’s system requirements and supported platforms in the [latest release notes](https://github.com/session-foundation/session-desktop/releases/latest#user-content-supported-platforms).

## Build Instructions

Build instructions can be found in [Contributing.md](CONTRIBUTING.md).

## Translations

Want to help us translate Cloak into your language?
Please refer to the translation process described in the contributing guide.

## Verifying Signatures

**Step 1:**
Add Jason's GPG key. Jason Rhinelander, a member of the [Session Technology Foundation](https://session.foundation/), is the current signer for releases. His GPG key can be found on his GitHub and other trusted sources.

```sh
wget https://github.com/jagerman.gpg
gpg --import jagerman.gpg
```

**Step 2:**
Get the signed hashes for this release. Replace `CLOAK_VERSION` with the release version you want to verify.

```sh
export CLOAK_VERSION=1.15.0
wget https://github.com/session-foundation/session-desktop/releases/download/v$CLOAK_VERSION/signature.asc
```

**Step 3:**
Verify the signature of the hashes of the files.

```sh
gpg --verify signature.asc 2>&1 | grep "Good signature from"
```

The command should print "`Good signature from "Jason Rhinelander..."`".
If it does, the hashes are valid—but you should still ensure the signed hashes match your downloaded files.

**Step 4:**
Make sure the two commands below return the same hash for the file you’re checking.
If they do, the file is valid.

<details>
<summary>Linux</summary>

```sh
sha256sum cloak-desktop-linux-amd64-$CLOAK_VERSION.deb
grep .deb signature.asc
```

</details>

<details>
<summary>macOS</summary>

**Apple Silicon**

```sh
sha256sum releases/cloak-desktop-mac-arm64-$CLOAK_VERSION.dmg
grep .dmg signature.asc
```

**Intel**

```sh
sha256sum releases/cloak-desktop-mac-x64-$CLOAK_VERSION.dmg
grep .dmg signature.asc
```

</details>

<details>
<summary>Windows</summary>

**Powershell**

```PowerShell
Get-FileHash -Algorithm SHA256 cloak-desktop-win-x64-$CLOAK_VERSION.exe
Select-String -Pattern ".exe" signature.asc
```

**Bash**

```sh
sha256sum cloak-desktop-win-x64-$CLOAK_VERSION.exe
grep .exe signature.asc
```

</details>

## Debian Repository

Please visit [https://deb.oxen.io/](https://deb.oxen.io/)

## License

Copyright 2011 Whisper Systems
Copyright 2013–2017 Open Whisper Systems
Copyright 2019–2024 The Oxen Project
Copyright 2024–2025 Session Technology Foundation

Licensed under the GPLv3: [https://www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html)

## Attributions

The IP-to-country mapping data used in this project is provided by [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data).

This project uses the [Lucide Icon Font](https://lucide.dev/), licensed under the [ISC License](./third_party_licenses/LucideLicense.txt).
