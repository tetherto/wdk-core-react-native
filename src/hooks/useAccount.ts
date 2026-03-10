import { useCallback, useMemo, useRef, useEffect } from 'react'
import { AccountService } from '../services/accountService'
import { getWalletStore } from '../store/walletStore'
import type { IAsset } from '../types'
import { BalanceFetchResult } from '../types'
import { convertBalanceToString } from '../utils/balanceUtils'
import { useAddressLoader } from './useAddressLoader'
import { requireInitialized } from 'src/utils/storeHelpers'

export type UseAccountParams = {
  accountIndex: number
  network: string
}

export interface TransactionParams {
  to: string
  asset: IAsset
  amount: string // Amount in smallest denomination (e.g., wei)
}

export interface UseAccountResponse {
  success: boolean
  error?: string
}

export interface TransactionResult extends UseAccountResponse {
  hash: string
  fee: string
}

export interface UseAccountReturn<T extends object> {
  /** The derived public address for this account. Null if not loaded. */
  address: string | null

  /** True if the account address is currently being derived. */
  isLoading: boolean

  /** An error object if address derivation failed. */
  error: Error | null

  /** The identifier object for this account. Null if no active wallet. */
  account: {
    accountIndex: number
    network: string
    walletId: string
  } | null

  /**
   * Fetches the balance for the given assets directly from the network.
   * This method does not use any cached data and always returns fresh results.
   */
  getBalance: (tokens: IAsset[]) => Promise<BalanceFetchResult[]>

  /**
   * Executes a transfer of any asset, from native coins to smart contract tokens.
   */
  send: (params: TransactionParams) => Promise<TransactionResult>

  /**
   * Signs a simple UTF-8 string message with the account's private key.
   */
  sign: (message: string) => Promise<UseAccountResponse & { signature: string }>

  /**
   * Verifies a signature.
   */
  verify: (message: string, signature: string) => Promise<UseAccountResponse & { verified: boolean }>
  
  /**
   * Query fee for a transaction.
   */
  estimateFee: (params: TransactionParams) => Promise<Omit<TransactionResult, 'hash'>>

  /**
   * Accesses chain-specific or other modular features not included in the core API.
   * Returns a typed, "live" proxied interface that will work correctly even if
   * the account is not ready at the time of its creation.
   * @example
   * const btcAccount = useAccount<WalletAccountBtc>();
   * const btcExtension = btcAccount.extension(); // This can be called safely at any time
   * const utxos = await btcExtension.getTransfers(); // This will work once the account is ready
   */
  extension: () => T
}

export function useAccount<T extends object = {}>(
  accountParams: UseAccountParams,
): UseAccountReturn<T> {
  const { address, isLoading, error: addressLoaderError } = useAddressLoader(accountParams)
  const activeWalletId = getWalletStore()((state) => state.activeWalletId)
  
  const activeWalletError = useMemo(() => {
    if (!activeWalletId) {
      return new Error('No active wallet')
    } else {
      return null
    }
  }, [activeWalletId])

  const account = useMemo(
    () =>
      activeWalletId && address
        ? {
            accountIndex: accountParams.accountIndex,
            network: accountParams.network,
            walletId: activeWalletId,
          }
        : null,
    [
      accountParams.accountIndex,
      accountParams.network,
      activeWalletId,
      address,
    ],
  )
  
  const accountRef = useRef(account)
  useEffect(() => {
    accountRef.current = account
  }, [account])

  const getBalance = useCallback(
    async (tokens: IAsset[]): Promise<BalanceFetchResult[]> => {
      await requireInitialized();
      const currentAccount = accountRef.current;

      if (!currentAccount) {
        return tokens.map(asset => ({
          success: false,
          network: accountParams.network,
          accountIndex: accountParams.accountIndex,
          assetId: asset.getId(),
          balance: null,
          error: 'No active account',
        }))
      }

      if (!tokens || tokens.length === 0) {
        return []
      }

      const results = await Promise.all(
        tokens.map(async (asset) => {
          try {
            let balanceResult: string

            if (asset.isNative()) {
              balanceResult = await AccountService.callAccountMethod<
                'getBalance'
              >(currentAccount.network, currentAccount.accountIndex, 'getBalance')
            } else {
              const tokenAddress = asset.getContractAddress()

              if (!tokenAddress) {
                throw new Error('Token address cannot be null')
              }

              balanceResult = await AccountService.callAccountMethod<
                'getTokenBalance'
              >(
                currentAccount.network,
                currentAccount.accountIndex,
                'getTokenBalance',
                tokenAddress,
              )
            }

            const balance = convertBalanceToString(balanceResult)

            return {
              success: true,
              network: currentAccount.network,
              accountIndex: currentAccount.accountIndex,
              assetId: asset.getId(),
              balance,
            }
          } catch (err) {
            return {
              success: false,
              network: currentAccount.network,
              accountIndex: currentAccount.accountIndex,
              assetId: asset.getId(),
              balance: null,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )

      return results
    },
    [accountRef, accountParams.network, accountParams.accountIndex],
  )

  const send = useCallback(
    async (params: TransactionParams): Promise<TransactionResult> => {
      await requireInitialized();
      
      const currentAccount = accountRef.current;
      if (!currentAccount) {
        return {
          success: false,
          hash: '',
          fee: '',
          error: 'Cannot send transaction: no active account'
        }
      }
      
      const { to, asset, amount } = params

      if (asset.isNative()) {
        const txResult = await AccountService.callAccountMethod<'sendTransaction'>(
          currentAccount.network,
          currentAccount.accountIndex,
          'sendTransaction',
          {
            to,
            value: amount,
          },
        )
        
        return {
          success: true,
          ...txResult
        }
      } else {
        const tokenAddress = asset.getContractAddress()

        if (!tokenAddress) {
          return {
            success: false,
            hash: '',
            fee: '',
            error: 'Token address cannot be null'
          }
        }

        const txResult = await AccountService.callAccountMethod<'transfer'>(
          currentAccount.network,
          currentAccount.accountIndex,
          'transfer',
          {
            recipient: to,
            amount,
            token: tokenAddress,
          },
        )
        
        return {
          success: true,
          ...txResult
        }
      }
    },
    [accountRef],
  )

  const sign = useCallback(
    async (message: string): Promise<UseAccountResponse & { signature: string }> => {
      await requireInitialized();
      const currentAccount = accountRef.current;

      if (!currentAccount) {
        return {
          success: false,
          signature: '',
          error: 'Cannot sign message: no active account'
        }
      }

      const signature = await AccountService.callAccountMethod<'sign'>(
        currentAccount.network,
        currentAccount.accountIndex,
        'sign',
        message,
      )

      return {
        success: true,
        signature
      }
    },
    [accountRef],
  )

  const verify = useCallback(
    async (message: string, signature: string): Promise<UseAccountResponse & { verified: boolean }> => {
      await requireInitialized();
      const currentAccount = accountRef.current;

      if (!currentAccount) {
        return {
          success: false,
          verified: false,
          error: 'Cannot verify signature: no active account'
        }
      }
      
      const isValid = await AccountService.callAccountMethod<'verify'>(
        currentAccount.network,
        currentAccount.accountIndex,
        'verify',
        message,
        signature,
      )

      return {
        success: true,
        verified: isValid
      }
    },
    [accountRef],
  )
  
  const estimateFee = useCallback(
    async (
      params: TransactionParams,
    ): Promise<Omit<TransactionResult, 'hash'>> => {
      await requireInitialized();
      const currentAccount = accountRef.current;

      if (!currentAccount) {
        return {
          success: false,
          error: 'Cannot estimate fee: account is not active or not initialized.',
          fee: '',
        }
      }

      if (params.asset.isNative()) {
        const feeResponse =
          await AccountService.callAccountMethod<'quoteSendTransaction'>(
            currentAccount.network,
            currentAccount.accountIndex,
            'quoteSendTransaction',
            { to: params.to, value: params.amount },
          )

        return {
          success: true,
          ...feeResponse,
        }
      }

      const tokenAddress = params.asset.getContractAddress()

      if (!tokenAddress) {
        return {
          success: false,
          error: 'Token address cannot be null',
          fee: '',
        }
      }

      const feeResponse = await AccountService.callAccountMethod<'quoteTransfer'>(
        currentAccount.network,
        currentAccount.accountIndex,
        'quoteTransfer',
        { recipient: params.to, amount: params.amount, token: tokenAddress },
      )

      return {
        success: true,
        ...feeResponse,
      }
    },
    [accountRef],
  )

  const extension = useCallback((): T => {
    return new Proxy({} as T, {
      get: (_target, prop) => {
        // Avoid issues with promise-like checks on the proxy itself
        if (prop === 'then') {
          return undefined
        }

        return async (...args: unknown[]) => {
          await requireInitialized();

          const currentAccount = accountRef.current

          if (!currentAccount) {
            console.error(
              '[useAccount] Extension call failed: Account is not available even after wallet initialization.',
            )
            return undefined
          }

          if (typeof prop === 'string') {
            return await AccountService.callAccountMethod(
              currentAccount.network,
              currentAccount.accountIndex,
              prop,
              ...args,
            )
          }
        }
      },
    })
  }, [accountRef])

  return useMemo(
    () => {
      return {
        address,
        isLoading,
        error: activeWalletError ?? addressLoaderError,
        account,
        getBalance,
        send,
        sign,
        verify,
        estimateFee,
        extension,
      }
    },
    [
      address,
      isLoading,
      activeWalletError,
      addressLoaderError,
      account,
      getBalance,
      estimateFee,
      send,
      sign,
      verify,
      extension,
    ],
  )
}
