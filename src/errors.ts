export type NussioErrorCode =
    | 'rejected'
    | 'not_connected'
    | 'connections_disabled'
    | 'requests_disabled'
    | 'unknown_chain'
    | 'no_chains'
    | 'locked'
    | 'rate_limited'
    | 'invalid_params'
    | 'params_too_large'
    | 'unknown_method'
    | 'provider_error'
    | 'no_window'
    | 'not_installed'
    | 'chain_required'
    | 'chain_mismatch'
    | 'no_signatures'

const MESSAGES: Record<NussioErrorCode, string> = {
    rejected: 'The request was rejected in Nussio Wallet.',
    not_connected:
        'This site is not connected to Nussio Wallet. Log in again to approve the connection.',
    connections_disabled: 'Website connections are turned off in Nussio Wallet settings.',
    requests_disabled: 'Signing requests are turned off in Nussio Wallet settings.',
    unknown_chain: 'Nussio Wallet has no enabled chain matching this request.',
    no_chains: 'Nussio Wallet has no enabled chains.',
    locked: 'Nussio Wallet is locked. Unlock it and try again.',
    rate_limited: 'Too many requests to Nussio Wallet. Wait a moment and try again.',
    invalid_params: 'Nussio Wallet rejected the request parameters.',
    params_too_large: 'The request is too large for Nussio Wallet.',
    unknown_method: 'The installed Nussio Wallet does not support this call.',
    provider_error: 'Nussio Wallet returned an unknown error.',
    no_window: 'Nussio Wallet is only available in a browser.',
    not_installed: 'Nussio Wallet is not installed in this browser.',
    chain_required: 'A chain must be selected before logging in with Nussio Wallet.',
    chain_mismatch: 'Nussio Wallet logged in to a different chain than requested.',
    no_signatures: 'Nussio Wallet returned no signatures.',
}

function messageFor(code: string): string {
    return (MESSAGES as Record<string, string>)[code] ?? `Nussio Wallet error: ${code}`
}

export class NussioWalletError extends Error {
    readonly code: string

    constructor(code: string, message = messageFor(code)) {
        super(message)
        this.name = 'NussioWalletError'
        this.code = code
        Object.setPrototypeOf(this, NussioWalletError.prototype)
    }
}

export function fromProviderError(error: unknown): NussioWalletError {
    if (error instanceof NussioWalletError) return error
    if (typeof error === 'string') return new NussioWalletError(error)
    if (error instanceof Error && error.message) return new NussioWalletError(error.message)
    return new NussioWalletError('provider_error')
}
