import {NussioWalletError} from './errors'

export interface NussioLoginResult {
    chainId: string
    actor: string
    permission: string
}

export interface NussioTransactResult {
    chainId: string
    transactionId?: string
    blockNum?: number
    signatures: string[]
}

export interface NussioTransactArgs {
    action?: unknown
    actions?: unknown[]
    transaction?: unknown
    broadcast?: boolean
    chainId?: string
}

export interface NussioProvider {
    readonly version: string
    readonly isNussioWallet: true
    login(chainId?: string): Promise<NussioLoginResult>
    transact(args: NussioTransactArgs | string): Promise<NussioTransactResult>
    sign(request: string): Promise<NussioTransactResult>
    disconnect(): Promise<boolean>
    isConnected(): Promise<boolean>
}

declare global {
    interface Window {
        nussio?: NussioProvider
    }
}

export const NUSSIO_INITIALIZED_EVENT = 'nussio#initialized'
export const DEFAULT_DETECT_TIMEOUT = 2000
const POLL_INTERVAL = 50

function scope(): Window | undefined {
    return typeof window === 'undefined' ? undefined : window
}

function installed(target: Window | undefined): NussioProvider | undefined {
    const provider = target?.nussio
    return provider && provider.isNussioWallet === true ? provider : undefined
}

export function isNussioInstalled(): boolean {
    return installed(scope()) !== undefined
}

export function detectProvider(timeout = DEFAULT_DETECT_TIMEOUT): Promise<NussioProvider> {
    const target = scope()
    if (!target) return Promise.reject(new NussioWalletError('no_window'))
    const found = installed(target)
    if (found) return Promise.resolve(found)
    return new Promise((resolve, reject) => {
        const stop = () => {
            clearTimeout(timer)
            clearInterval(poll)
            target.removeEventListener(NUSSIO_INITIALIZED_EVENT, check)
        }
        const check = () => {
            const provider = installed(target)
            if (!provider) return
            stop()
            resolve(provider)
        }
        const timer = setTimeout(() => {
            stop()
            reject(new NussioWalletError('not_installed'))
        }, timeout)
        const poll = setInterval(check, POLL_INTERVAL)
        target.addEventListener(NUSSIO_INITIALIZED_EVENT, check)
    })
}
