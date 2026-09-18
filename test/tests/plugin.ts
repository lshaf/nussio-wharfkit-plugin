import {assert} from 'chai'
import pako from 'pako'
import {
    Checksum256,
    PermissionLevel,
    PrivateKey,
    SessionKit,
    SigningRequest,
    Transaction,
} from '@wharfkit/session'
import {
    mockChainDefinition,
    mockChainId,
    mockPermissionLevel,
    mockPrivateKey,
    mockSessionKitArgs,
    mockSessionKitOptions,
} from '@wharfkit/mock-data'

import {
    fromProviderError,
    isNussioInstalled,
    NUSSIO_INITIALIZED_EVENT,
    NussioProvider,
    WalletPluginNussio,
} from '$lib'

const zlib = {
    deflateRaw: (data: Uint8Array) => pako.deflateRaw(data),
    inflateRaw: (data: Uint8Array) => pako.inflateRaw(data),
}

interface Calls {
    login: (string | undefined)[]
    sign: string[]
    disconnect: number
}

function fakeProvider(overrides: Partial<NussioProvider> = {}) {
    const calls: Calls = {login: [], sign: [], disconnect: 0}
    const key = PrivateKey.from(mockPrivateKey)
    const permission = PermissionLevel.from(mockPermissionLevel)
    const provider: NussioProvider = {
        version: '1.1.3',
        isNussioWallet: true,
        async login(chainId) {
            calls.login.push(chainId)
            return {
                chainId: chainId ?? mockChainId,
                actor: String(permission.actor),
                permission: String(permission.permission),
            }
        },
        async sign(uri) {
            calls.sign.push(uri)
            const request = SigningRequest.from(uri, {zlib})
            const chainId = request.getChainId()
            const transaction = Transaction.from(request.getRawTransaction())
            const signature = key.signDigest(transaction.signingDigest(chainId))
            return {
                chainId: String(chainId),
                transactionId: String(transaction.id),
                signatures: [String(signature)],
            }
        },
        async transact() {
            throw new Error('unknown_method')
        },
        async disconnect() {
            calls.disconnect += 1
            return true
        },
        async isConnected() {
            return true
        },
        ...overrides,
    }
    return {provider, calls}
}

function installWindow(provider?: NussioProvider): Window {
    const target = new EventTarget() as unknown as Window & {nussio?: NussioProvider}
    target.nussio = provider
    ;(globalThis as {window?: Window}).window = target
    return target
}

function kitWith(plugin: WalletPluginNussio) {
    return new SessionKit(
        {...mockSessionKitArgs, walletPlugins: [plugin]},
        {...mockSessionKitOptions, storage: mockSessionKitOptions.storage}
    )
}

const transfer = {
    action: {
        authorization: [PermissionLevel.from(mockPermissionLevel)],
        account: 'eosio.token',
        name: 'transfer',
        data: {
            from: PermissionLevel.from(mockPermissionLevel).actor,
            to: 'wharfkittest',
            quantity: '0.0001 EOS',
            memo: 'wharfkit/session wallet plugin template',
        },
    },
}

suite('WalletPluginNussio', function () {
    teardown(function () {
        delete (globalThis as {window?: Window}).window
    })

    test('login and sign through the extension', async function () {
        const {provider, calls} = fakeProvider()
        installWindow(provider)
        const kit = kitWith(new WalletPluginNussio())
        const {session} = await kit.login({chain: mockChainDefinition.id})
        assert.isTrue(session.chain.equals(mockChainDefinition))
        assert.isTrue(session.actor.equals(PermissionLevel.from(mockPermissionLevel).actor))
        assert.isTrue(
            session.permission.equals(PermissionLevel.from(mockPermissionLevel).permission)
        )
        assert.deepEqual(calls.login, [mockChainId])

        const result = await session.transact(transfer, {broadcast: false})
        assert.isTrue(result.signer.equals(mockPermissionLevel))
        assert.equal(result.signatures.length, 1)
        assert.equal(calls.sign.length, 1)

        const request = SigningRequest.from(calls.sign[0], {zlib})
        assert.isFalse(request.shouldBroadcast())
        assert.isTrue(request.getChainId().equals(mockChainId))
        const sent = Transaction.from(request.getRawTransaction())
        assert.isTrue(sent.equals(result.resolved!.transaction))
        const key = PrivateKey.from(mockPrivateKey)
        assert.isTrue(
            result.signatures[0].verifyDigest(
                sent.signingDigest(Checksum256.from(mockChainId)),
                key.toPublic()
            )
        )
    })

    test('login rejects when the extension answers with another chain', async function () {
        const {provider} = fakeProvider({
            async login() {
                return {
                    chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906',
                    actor: 'wharfkit1111',
                    permission: 'test',
                }
            },
        })
        installWindow(provider)
        const kit = kitWith(new WalletPluginNussio())
        try {
            await kit.login({chain: mockChainDefinition.id})
            assert.fail('expected login to throw')
        } catch (error) {
            assert.match(String(error), /different chain than requested/)
        }
    })

    test('maps extension rejections to NussioWalletError', async function () {
        const {provider} = fakeProvider({
            async login() {
                throw new Error('rejected')
            },
        })
        installWindow(provider)
        const kit = kitWith(new WalletPluginNussio())
        try {
            await kit.login({chain: mockChainDefinition.id})
            assert.fail('expected login to throw')
        } catch (error) {
            assert.match(String(error), /rejected in Nussio Wallet/)
        }
    })

    test('waits for the extension to inject itself', async function () {
        const target = installWindow()
        assert.isFalse(isNussioInstalled())
        const {provider, calls} = fakeProvider()
        setTimeout(() => {
            ;(target as Window & {nussio?: NussioProvider}).nussio = provider
            target.dispatchEvent(new Event(NUSSIO_INITIALIZED_EVENT))
        }, 100)
        const kit = kitWith(new WalletPluginNussio({detectTimeout: 1000}))
        const {session} = await kit.login({chain: mockChainDefinition.id})
        assert.isTrue(session.chain.equals(mockChainDefinition))
        assert.equal(calls.login.length, 1)
        assert.isTrue(isNussioInstalled())
    })

    test('fails when the extension is missing', async function () {
        installWindow()
        const kit = kitWith(new WalletPluginNussio({detectTimeout: 100}))
        try {
            await kit.login({chain: mockChainDefinition.id})
            assert.fail('expected login to throw')
        } catch (error) {
            assert.match(String(error), /not installed/)
        }
    })

    test('sign surfaces extension errors', async function () {
        const {provider} = fakeProvider({
            async sign() {
                throw new Error('not_connected')
            },
        })
        installWindow(provider)
        const kit = kitWith(new WalletPluginNussio())
        const {session} = await kit.login({chain: mockChainDefinition.id})
        try {
            await session.transact(transfer, {broadcast: false})
            assert.fail('expected transact to throw')
        } catch (error) {
            assert.match(String(error), /not connected to Nussio Wallet/)
        }
    })

    test('fromProviderError keeps the extension code', function () {
        assert.equal(fromProviderError(new Error('rejected')).code, 'rejected')
        assert.equal(fromProviderError('locked').code, 'locked')
        assert.equal(fromProviderError(undefined).code, 'provider_error')
        assert.equal(fromProviderError(new Error('something_new')).code, 'something_new')
        assert.match(fromProviderError(new Error('something_new')).message, /something_new/)
    })

    test('logout disconnects the site', async function () {
        const {provider, calls} = fakeProvider()
        installWindow(provider)
        const kit = kitWith(new WalletPluginNussio())
        const {session} = await kit.login({chain: mockChainDefinition.id})
        await kit.logout(session)
        assert.equal(calls.disconnect, 1)
    })
})
