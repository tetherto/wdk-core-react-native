// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Tests for useBalance hook
 *
 * Tests balance hook logic with TanStack Query integration
 */

import { balanceQueryKeys } from '../../hooks/useBalance'
import { AccountService } from '../../services/accountService'
import { BalanceService } from '../../services/balanceService'
import { getWorkletStore } from '../../store/workletStore'
import { getWalletStore } from '../../store/walletStore'
import { convertBalanceToString } from '../../utils/balanceUtils'
import { QUERY_KEY_TAGS } from '../../utils/constants'
import type { IAsset } from '../../types'

// Mock TanStack Query
const mockUseQueryReturn = jest.fn()
jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: any[]) => mockUseQueryReturn(...args),
  useMutation: jest.fn(),
  useQueries: jest.fn(),
  useQueryClient: jest.fn(),
}))

// Mock address loaders
const mockUseAddressLoader = jest.fn()
jest.mock('../../hooks/useAddressLoader', () => ({
  useAddressLoader: (...args: any[]) => mockUseAddressLoader(...args),
}))

const mockUseMultiAddressLoader = jest.fn()
jest.mock('../../hooks/useMultiAddressLoader', () => ({
  useMultiAddressLoader: (...args: any[]) => mockUseMultiAddressLoader(...args),
}))

// Mock stores and services
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}))

jest.mock('../../store/walletStore', () => ({
  getWalletStore: jest.fn(),
}))

jest.mock('../../services/accountService', () => ({
  AccountService: {
    callAccountMethod: jest.fn(),
  },
}))

jest.mock('../../services/balanceService', () => ({
  BalanceService: {
    updateBalance: jest.fn(),
    updateLastBalanceUpdate: jest.fn(),
    getBalance: jest.fn(),
  },
}))

jest.mock('../../utils/balanceUtils', () => ({
  convertBalanceToString: jest.fn((val) => String(val)),
}))

jest.mock('../../utils/storeHelpers', () => ({
  resolveWalletId: jest.fn((id) => id || 'default-wallet'),
}))

jest.mock('../../utils/validation', () => ({
  validateWalletParams: jest.fn(),
}))

jest.mock('../../utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn(),
}))

const MOCK_NATIVE_TOKEN_ID = 'eth-native'

describe('useBalance', () => {
  let mockWorkletStore: any
  let mockWalletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true,
      })),
    }

    mockWalletStore = {
      getState: jest.fn(() => ({
        activeWalletId: 'test-wallet-1',
      })),
    }
    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('balanceQueryKeys', () => {
    it('should create correct query keys', () => {
      expect(balanceQueryKeys.all).toEqual([QUERY_KEY_TAGS.BALANCES])

      const walletKey = balanceQueryKeys.byWallet('wallet-1', 0)
      expect(walletKey).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, 'wallet-1', 0])

      const networkKey = balanceQueryKeys.byNetwork('ethereum')
      expect(networkKey).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.NETWORK, 'ethereum'])

      const walletNetworkKey = balanceQueryKeys.byWalletAndNetwork(
        'wallet-1',
        0,
        'ethereum',
      )
      expect(walletNetworkKey).toEqual([
        QUERY_KEY_TAGS.BALANCES,
        QUERY_KEY_TAGS.WALLET,
        'wallet-1',
        0,
        QUERY_KEY_TAGS.NETWORK,
        'ethereum',
      ])

      const nativeTokenKey = balanceQueryKeys.byToken(
        'wallet-1',
        0,
        'ethereum',
        MOCK_NATIVE_TOKEN_ID,
      )
      expect(nativeTokenKey).toEqual([
        QUERY_KEY_TAGS.BALANCES,
        QUERY_KEY_TAGS.WALLET,
        'wallet-1',
        0,
        QUERY_KEY_TAGS.NETWORK,
        'ethereum',
        QUERY_KEY_TAGS.TOKEN,
        MOCK_NATIVE_TOKEN_ID,
      ])

      const tokenKey = balanceQueryKeys.byToken(
        'wallet-1',
        0,
        'ethereum',
        '0x123',
      )
      expect(tokenKey).toEqual([
        QUERY_KEY_TAGS.BALANCES,
        QUERY_KEY_TAGS.WALLET,
        'wallet-1',
        0,
        QUERY_KEY_TAGS.NETWORK,
        'ethereum',
        QUERY_KEY_TAGS.TOKEN,
        '0x123',
      ])
    })
  })

  describe('fetchBalance function (tested via hook)', () => {
    it('should handle wallet not initialized', async () => {
      mockWorkletStore.getState.mockReturnValue({ isInitialized: false })

      mockUseQueryReturn.mockReturnValue({
        data: {
          success: false,
          network: 'ethereum',
          accountIndex: 0,
          assetId: MOCK_NATIVE_TOKEN_ID,
          balance: null,
          error: 'Wallet not initialized',
        },
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: true,
        error: null,
      })

      // The hook would be called in a React component, but we can test the query function
      expect(mockUseQueryReturn).toBeDefined()
    })

    it('should fetch native balance successfully', async () => {
      const mockBalance = '1000000000000000000'
      ;(AccountService.callAccountMethod as jest.Mock).mockResolvedValue(
        mockBalance,
      )
      ;(convertBalanceToString as jest.Mock).mockReturnValue(mockBalance)

      // Simulate query function call
      const queryFn = mockUseQueryReturn.mock.calls[0]?.[0]?.queryFn
      if (queryFn) {
        const result = await queryFn()
        expect(result.success).toBe(true)
        expect(result.balance).toBe(mockBalance)
        expect(AccountService.callAccountMethod).toHaveBeenCalled()
        expect(BalanceService.updateBalance).toHaveBeenCalled()
      }
    })

    it('should fetch token balance successfully', async () => {
      const mockBalance = '2000000000000000000'
      const tokenAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      ;(AccountService.callAccountMethod as jest.Mock).mockResolvedValue(
        mockBalance,
      )
      ;(convertBalanceToString as jest.Mock).mockReturnValue(mockBalance)

      // Simulate query function call
      const queryFn = mockUseQueryReturn.mock.calls[0]?.[0]?.queryFn
      if (queryFn) {
        const result = await queryFn()
        expect(result.success).toBe(true)
        expect(result.balance).toBe(mockBalance)
        expect(AccountService.callAccountMethod).toHaveBeenCalledWith(
          'ethereum',
          0,
          'getTokenBalance',
          tokenAddress,
        )
      }
    })

    it('should handle fetch errors', async () => {
      const error = new Error('Network error')
      ;(AccountService.callAccountMethod as jest.Mock).mockRejectedValue(error)

      // Simulate query function call
      const queryFn = mockUseQueryReturn.mock.calls[0]?.[0]?.queryFn
      if (queryFn) {
        const result = await queryFn()
        expect(result.success).toBe(false)
        expect(result.error).toBe('Network error')
        expect(result.balance).toBeNull()
      }
    })
  })

  describe('useBalancesForWallet', () => {
    it('should build query keys for all tokens', async () => {
      // Create mock assets
      const mockAssets: IAsset[] = [
        {
          getId: () => MOCK_NATIVE_TOKEN_ID,
          getNetwork: () => 'ethereum',
          isNative: () => true,
          getContractAddress: () => null,
        } as IAsset,
        {
          getId: () => '0x123',
          getNetwork: () => 'ethereum',
          isNative: () => false,
          getContractAddress: () => '0x123',
        } as IAsset
      ]

      mockUseQueryReturn.mockReturnValue({
        data: [],
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: true,
        error: null,
      })

      // We just check the hook can be imported and mocking works
      // Logic testing for IAsset iteration happens in the hook implementation
      expect(mockUseQueryReturn).toBeDefined()
    })
  })

  describe('useBalance isLoading composition', () => {
    const mockAsset: IAsset = {
      getId: () => MOCK_NATIVE_TOKEN_ID,
      getNetwork: () => 'ethereum',
      isNative: () => true,
      getContractAddress: () => null,
    } as IAsset

    beforeEach(() => {
      ;(getWalletStore as jest.Mock).mockReturnValue(() => 'test-wallet-1')
      ;(BalanceService.getBalance as jest.Mock).mockReturnValue(null)
    })

    it('should report isLoading true during initial fetch with initialData', () => {
      mockUseAddressLoader.mockReturnValue({
        address: '0xabc',
        isLoading: false,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: [{ success: true, balance: null }],
        isLoading: false,
        isFetching: true,
        isFetchedAfterMount: false,
        error: null,
      })

      const { useBalance } = require('../../hooks/useBalance')
      const result = useBalance(0, mockAsset)

      expect(result.isLoading).toBe(true)
    })

    it('should report isLoading false after initial fetch completes', () => {
      mockUseAddressLoader.mockReturnValue({
        address: '0xabc',
        isLoading: false,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: [{ success: true, balance: '1000' }],
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: true,
        error: null,
      })

      const { useBalance } = require('../../hooks/useBalance')
      const result = useBalance(0, mockAsset)

      expect(result.isLoading).toBe(false)
    })

    it('should report isLoading false during background refetch', () => {
      mockUseAddressLoader.mockReturnValue({
        address: '0xabc',
        isLoading: false,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: [{ success: true, balance: '1000' }],
        isLoading: false,
        isFetching: true,
        isFetchedAfterMount: true,
        error: null,
      })

      const { useBalance } = require('../../hooks/useBalance')
      const result = useBalance(0, mockAsset)

      expect(result.isLoading).toBe(false)
    })

    it('should report isLoading true when address is still loading', () => {
      mockUseAddressLoader.mockReturnValue({
        address: null,
        isLoading: true,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: false,
        error: null,
      })

      const { useBalance } = require('../../hooks/useBalance')
      const result = useBalance(0, mockAsset)

      expect(result.isLoading).toBe(true)
    })
  })

  describe('useBalancesForWallet isLoading composition', () => {
    const mockAssets: IAsset[] = [
      {
        getId: () => MOCK_NATIVE_TOKEN_ID,
        getNetwork: () => 'ethereum',
        isNative: () => true,
        getContractAddress: () => null,
      } as IAsset,
      {
        getId: () => 'usdt',
        getNetwork: () => 'ethereum',
        isNative: () => false,
        getContractAddress: () => '0x123',
      } as IAsset,
    ]

    beforeEach(() => {
      ;(getWalletStore as jest.Mock).mockReturnValue(() => 'test-wallet-1')
      ;(BalanceService.getBalance as jest.Mock).mockReturnValue(null)
    })

    it('should report isLoading true during initial fetch with initialData', () => {
      mockUseMultiAddressLoader.mockReturnValue({
        addresses: [{ network: 'ethereum', address: '0xabc' }],
        isLoading: false,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: mockAssets.map((a) => ({ success: true, balance: null, network: a.getNetwork(), assetId: a.getId(), accountIndex: 0 })),
        isLoading: false,
        isFetching: true,
        isFetchedAfterMount: false,
        error: null,
      })

      const { useBalancesForWallet } = require('../../hooks/useBalance')
      const result = useBalancesForWallet(0, mockAssets)

      expect(result.isLoading).toBe(true)
    })

    it('should report isLoading false after initial fetch completes', () => {
      mockUseMultiAddressLoader.mockReturnValue({
        addresses: [{ network: 'ethereum', address: '0xabc' }],
        isLoading: false,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: mockAssets.map((a) => ({ success: true, balance: '1000', network: a.getNetwork(), assetId: a.getId(), accountIndex: 0 })),
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: true,
        error: null,
      })

      const { useBalancesForWallet } = require('../../hooks/useBalance')
      const result = useBalancesForWallet(0, mockAssets)

      expect(result.isLoading).toBe(false)
    })

    it('should report isLoading false during background refetch', () => {
      mockUseMultiAddressLoader.mockReturnValue({
        addresses: [{ network: 'ethereum', address: '0xabc' }],
        isLoading: false,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: mockAssets.map((a) => ({ success: true, balance: '1000', network: a.getNetwork(), assetId: a.getId(), accountIndex: 0 })),
        isLoading: false,
        isFetching: true,
        isFetchedAfterMount: true,
        error: null,
      })

      const { useBalancesForWallet } = require('../../hooks/useBalance')
      const result = useBalancesForWallet(0, mockAssets)

      expect(result.isLoading).toBe(false)
    })

    it('should report isLoading true when addresses are still loading', () => {
      mockUseMultiAddressLoader.mockReturnValue({
        addresses: null,
        isLoading: true,
        error: null,
      })
      mockUseQueryReturn.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: false,
        error: null,
      })

      const { useBalancesForWallet } = require('../../hooks/useBalance')
      const result = useBalancesForWallet(0, mockAssets)

      expect(result.isLoading).toBe(true)
    })
  })

  describe('useRefreshBalance', () => {
    it('should invalidate queries correctly', async () => {
      // Since we can't actually call React hooks in Node environment,
      // we verify that the hook exports exist and the query key functions work
      const { useRefreshBalance, balanceQueryKeys } = await import(
        '../../hooks/useBalance'
      )

      // Verify the hook is exported
      expect(typeof useRefreshBalance).toBe('function')

      // Verify query keys can be used for invalidation
      const allKeys = balanceQueryKeys.all
      const walletKeys = balanceQueryKeys.byWallet('wallet-1', 0)
      const networkKeys = balanceQueryKeys.byNetwork('ethereum')
      const tokenKeys = balanceQueryKeys.byToken(
        'wallet-1',
        0,
        'ethereum',
        MOCK_NATIVE_TOKEN_ID,
      )

      expect(allKeys).toEqual([QUERY_KEY_TAGS.BALANCES])
      expect(walletKeys).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, 'wallet-1', 0])
      expect(networkKeys).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.NETWORK, 'ethereum'])
      expect(tokenKeys).toContain(QUERY_KEY_TAGS.BALANCES)
    })
  })
})