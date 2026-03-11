import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getWalletStore } from '../store/walletStore'
import { AddressService } from '../services/addressService'
import { AddressInfo, AddressInfoResult } from '../types'

export interface UseAddressesReturn {
  /** All loaded addresses for the active wallet. */
  data: AddressInfo[] | undefined
  /** True if ANY address is currently being loaded. */
  isLoading: boolean
  /**
   * Manually triggers a fetch for addresses for the given account indices.
   *
   * Note: In many cases, address loading is handled automatically by hooks
   * like `useAccount`. This function is a utility for cases where you need
   * explicit control to pre-load multiple addresses.
   *
   * If the `networks` array is provided, it fetches only for those networks.
   * Otherwise, it fetches for all configured networks.
   */
  loadAddresses: (
    accountIndices: number[],
    networks?: string[],
  ) => Promise<AddressInfoResult[]>
  /**
   * A helper to get a filtered list of addresses for a single network.
   */
  getAddressesForNetwork: (
    network: string,
  ) => Array<{ address: string; accountIndex: number }>
  /**
   * A helper to resolve an address string back to its full account information.
   * Performs a case-insensitive search.
   */
  getAccountInfoFromAddress: (address: string) => AddressInfo | undefined
}

export function useAddresses(): UseAddressesReturn {
  const { activeAddresses, activeWalletLoading } =
    getWalletStore()(
      useShallow((state) => {
        const activeId = state.activeWalletId

        if (!activeId) {
          return {
            activeWalletId: null,
            activeAddresses: undefined,
            activeWalletLoading: undefined,
          }
        }

        return {
          activeWalletId: activeId,
          activeAddresses: state.addresses[activeId],
          activeWalletLoading: state.walletLoading[activeId],
        }
      }),
    )

  const data = useMemo((): AddressInfo[] | undefined => {
    if (!activeAddresses) return undefined

    const flattened = Object.entries(activeAddresses).flatMap(
      ([network, accounts]) =>
        Object.entries(accounts).map(([accountIndex, address]) => ({
          address,
          network,
          accountIndex: parseInt(accountIndex, 10),
        })),
    )

    return flattened
  }, [activeAddresses])

  const isLoading = useMemo(() => {
    if (!activeWalletLoading) return false

    return Object.values(activeWalletLoading).some((isLoading) => isLoading)
  }, [activeWalletLoading])

  const loadAddresses = useCallback(
    (
      accountIndices: number[],
      networks?: string[],
    ): Promise<AddressInfoResult[]> => {
      return AddressService.getAddresses(accountIndices, networks);
    },
    [],
  )

  const getAddressesForNetwork = useCallback(
    (network: string) => {
      if (!data) return []
      return data
        .filter((d) => d.network === network)
        .map(({ address, accountIndex }) => ({ address, accountIndex }))
    },
    [data],
  )

  const getAccountInfoFromAddress = useCallback(
    (addressToFind: string) => {
      if (!data) return undefined
      return data.find(
        (item) => item.address.toLowerCase() === addressToFind.toLowerCase(),
      )
    },
    [data],
  )

  return useMemo(
    () => ({
      data,
      isLoading,
      loadAddresses,
      getAddressesForNetwork,
      getAccountInfoFromAddress,
    }),
    [
      data,
      isLoading,
      loadAddresses,
      getAddressesForNetwork,
      getAccountInfoFromAddress,
    ],
  )
}
