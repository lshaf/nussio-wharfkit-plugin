import {
    AbstractWalletPlugin,
    Checksum256,
    LoginContext,
    PermissionLevel,
    ResolvedSigningRequest,
    Signature,
    TransactContext,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'

import {fromProviderError, NussioWalletError} from './errors'
import {DEFAULT_DETECT_TIMEOUT, detectProvider, NussioProvider} from './provider'
import {logo} from './logo'

export interface WalletPluginNussioOptions {
    detectTimeout?: number
    supportedChains?: string[]
}

export class WalletPluginNussio extends AbstractWalletPlugin implements WalletPlugin {
    readonly config: WalletPluginConfig = {
        requiresChainSelect: true,
        requiresPermissionSelect: false,
    }

    readonly metadata: WalletPluginMetadata = WalletPluginMetadata.from({
        name: 'Nussio Wallet',
        description: 'Antelope wallet and signing request authenticator as a browser extension.',
        logo,
        homepage: 'https://nussio.xid.run/',
        download:
            'https://chromewebstore.google.com/detail/nussio-wallet/mmemhingmgdnkjifmnfepboidlnjpacc',
    })

    private readonly detectTimeout: number

    constructor(options: WalletPluginNussioOptions = {}) {
        super()
        this.detectTimeout = options.detectTimeout ?? DEFAULT_DETECT_TIMEOUT
        if (options.supportedChains) {
            this.config.supportedChains = options.supportedChains
        }
    }

    get id(): string {
        return 'nussio'
    }

    async login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        if (!context.chain) throw new NussioWalletError('chain_required')
        const requested = context.chain.id
        const provider = await this.provider()
        const response = await call(() => provider.login(String(requested)))
        const chain = Checksum256.from(response.chainId)
        if (!chain.equals(requested)) throw new NussioWalletError('chain_mismatch')
        return {
            chain,
            permissionLevel: PermissionLevel.from({
                actor: response.actor,
                permission: response.permission,
            }),
        }
    }

    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        const provider = await this.provider()
        const request = await context.createRequest({transaction: resolved.transaction})
        request.setBroadcast(false)
        context.ui?.status('Confirm the transaction in Nussio Wallet')
        const response = await call(() => provider.sign(request.encode(true, false)))
        const signatures = response.signatures.map((signature) => Signature.from(signature))
        if (signatures.length === 0) throw new NussioWalletError('no_signatures')
        return {signatures}
    }

    async logout(): Promise<void> {
        try {
            const provider = await this.provider()
            await provider.disconnect()
        } catch {
            return
        }
    }

    private provider(): Promise<NussioProvider> {
        return detectProvider(this.detectTimeout)
    }
}

async function call<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        throw fromProviderError(error)
    }
}

export * from './errors'
export * from './provider'
