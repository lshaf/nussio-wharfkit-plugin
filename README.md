# nussio-wharfkit-plugin

A `WalletPlugin` for [@wharfkit/session](https://github.com/wharfkit/session) that signs with the
[Nussio Wallet](https://nussio.xid.run/) browser extension through its injected `window.nussio`
provider. No relay, no QR code: every login and transaction opens the extension prompt directly.

## Install

```sh
pnpm add nussio-wharfkit-plugin @wharfkit/session
```

`@wharfkit/session` is a peer dependency. Users need the
[Nussio Wallet extension](https://chromewebstore.google.com/detail/nussio-wallet/mmemhingmgdnkjifmnfepboidlnjpacc)
installed; the plugin's `metadata.download` points there so UIs such as `@wharfkit/web-renderer`
can offer the link.

## Usage

```ts
import {SessionKit} from '@wharfkit/session'
import {WebRenderer} from '@wharfkit/web-renderer'
import {WalletPluginNussio} from 'nussio-wharfkit-plugin'

const kit = new SessionKit({
    appName: 'myapp',
    chains: [
        {
            id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
            url: 'https://jungle4.greymass.com',
        },
    ],
    ui: new WebRenderer(),
    walletPlugins: [new WalletPluginNussio()],
})

const {session} = await kit.login()

await session.transact({
    action: {
        account: 'eosio.token',
        name: 'transfer',
        authorization: [session.permissionLevel],
        data: {from: session.actor, to: 'teamgreymass', quantity: '0.0001 EOS', memo: ''},
    },
})
```

Sessions restore like any other WharfKit session (`kit.restore()`); the extension keeps the site
connection until the user removes it under Settings → Connected websites.

## What happens

| Session call   | Plugin does                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit.login()`  | `window.nussio.login(chainId)`. The extension prompt asks the user to pick an account on that chain and approve the site.                          |
| `transact()`   | Encodes the resolved transaction as a non-broadcast signing request and calls `window.nussio.sign(uri)`. The extension signs, WharfKit broadcasts. |
| `kit.logout()` | `window.nussio.disconnect()`, dropping the site connection in the extension.                                                                       |

Because the extension only signs, the transaction WharfKit broadcasts is exactly the one it
resolved: TAPoS, expiration and any actions added by transact plugins are preserved.

## Behaviour and limits

-   `requiresChainSelect` is `true`: the chain comes from `kit.login({chain})`, the single configured
    chain, or the UI's chain picker. The extension must have that chain enabled or the login fails
    with `unknown_chain`.
-   The extension picks the account; `requiresPermissionSelect` is `false`.
-   Fuel / resource providers built into the extension only run for requests the extension
    broadcasts itself. With this plugin WharfKit broadcasts, so use
    `@wharfkit/transact-plugin-resource-provider` if you want cosigning.
-   Signing requests over 16 KB are refused by the extension. A prompt left open for five minutes
    rejects with `rejected`.
-   The provider is injected asynchronously at page start. The plugin waits up to two seconds
    (`detectTimeout`) for `window.nussio` before reporting the extension as missing.
-   `logout()` never throws: if the extension is unavailable the WharfKit session is still cleared.

## Options

```ts
new WalletPluginNussio({
    detectTimeout: 2000, // ms to wait for window.nussio before failing
    supportedChains: ['73e4…'], // restrict the plugin to these chain ids
})
```

## Errors

Extension rejections are thrown as `NussioWalletError` with a `code` and a readable message:

| code                   | meaning                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `rejected`             | user declined the prompt, or it timed out                    |
| `not_connected`        | site connection was removed in the extension; log in again   |
| `connections_disabled` | "Allow websites to connect" is off in the extension settings |
| `unknown_chain`        | requested chain is not enabled in the extension              |
| `locked`               | wallet is locked                                             |
| `not_installed`        | `window.nussio` never appeared                               |
| `chain_required`       | `login()` was called without a chain                         |
| `chain_mismatch`       | extension logged in to a chain other than the one requested  |
| `no_signatures`        | extension returned an empty signature list                   |

`SessionKit.login()` and `Session.transact()` rewrap whatever a wallet plugin throws in a plain
`Error`, so `instanceof NussioWalletError` only holds inside `ui.onError`. Match on the message, or
use `fromProviderError` when calling `window.nussio` yourself.

## Exports

-   `WalletPluginNussio` — the plugin
-   `NussioWalletError`, `fromProviderError`, `NussioErrorCode`
-   `NussioProvider`, `NussioLoginResult`, `NussioTransactResult`, `NussioTransactArgs` — types for
    `window.nussio`, plus a global `Window.nussio` declaration
-   `detectProvider`, `isNussioInstalled`, `NUSSIO_INITIALIZED_EVENT`, `DEFAULT_DETECT_TIMEOUT`

## Developing

Needs [Make](https://www.gnu.org/software/make/), Node.js 18+ and [pnpm](https://pnpm.io/).

```sh
make            # install and build lib/
make test       # mocha suite against a fake window.nussio
make check      # eslint
make format     # eslint --fix
```

The tests exercise the full SessionKit login → transact → logout flow with a fake provider that
decodes the signing request and signs it, so they verify the wire format without a browser.

## Credits

Built from [@wharfkit/wallet-plugin-template](https://github.com/wharfkit/wallet-plugin-template)
by [Greymass](https://greymass.com); see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
Nussio Wallet itself is a re-implementation of Greymass Anchor as a browser extension.

## License

[MIT](./LICENSE)
