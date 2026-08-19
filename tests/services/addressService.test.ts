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
 * Tests for AddressService
 * 
 * Tests address retrieval functionality
 */

import { AddressService } from '../../src/services/addressService'
import { getWorkletStore } from '../../src/store/workletStore'
import { getWalletStore } from '../../src/store/walletStore'
import { bumpEpoch } from '../../src/utils/workletEpoch'

// Mock stores
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}))

jest.mock('../../src/store/walletStore', () => ({
  getWalletStore: jest.fn(),
}))

describe('AddressService', () => {
  let mockWorkletStore: any
  let mockWalletStore: any
  let mockHRPC: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock HRPC
    mockHRPC = {
      callMethod: jest.fn(),
    }

    // Setup mock worklet store
    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true,
        hrpc: mockHRPC,
        isWorkletStarted: true,
        isWorkletStartedPromise: { promise: Promise.resolve() },
        isWorkletInitializedPromise: { promise: Promise.resolve() },
        wdkConfigs: {}
      })),
    }

    // Setup mock wallet store
    mockWalletStore = {
      getState: jest.fn(() => ({
        addresses: {},
        walletLoading: {},
        activeWalletId: 'test-wallet-1',
      })),
      setState: jest.fn(),
    }

    // Setup store mocks
    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('getAddress', () => {
    it('should get address from worklet and cache it', async () => {
      const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockAddress),
      })

      const address = await AddressService.getAddress('ethereum', 0)

      expect(address).toBe(mockAddress)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith({
        methodName: 'getAddress',
        network: 'ethereum',
        accountIndex: 0,
      })

      // Verify address was cached
      expect(mockWalletStore.setState).toHaveBeenCalledWith(
        expect.any(Function)
      )

      // Verify the state update function
      const setStateCall = mockWalletStore.setState.mock.calls.find(
        (call: any[]) => {
          const stateUpdater = call[0]
          if (typeof stateUpdater === 'function') {
            const prevState = {
              addresses: {},
              walletLoading: {},
              activeWalletId: 'test-wallet-1',
            }
            const newState = stateUpdater(prevState)
            return newState.addresses?.['test-wallet-1']?.ethereum?.[0] === mockAddress
          }
          return false
        }
      )
      expect(setStateCall).toBeDefined()
    })

    it('should return cached address if available', async () => {
      const cachedAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          'test-wallet-1': {
            ethereum: {
              0: cachedAddress,
            },
          },
        },
        walletLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      const address = await AddressService.getAddress('ethereum', 0)

      expect(address).toBe(cachedAddress)
      // Should not call HRPC if cached
      expect(mockHRPC.callMethod).not.toHaveBeenCalled()
    })

    it('should handle different networks', async () => {
      const ethereumAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const polygonAddress = '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      mockHRPC.callMethod
        .mockResolvedValueOnce({
          result: JSON.stringify(ethereumAddress),
        })
        .mockResolvedValueOnce({
          result: JSON.stringify(polygonAddress),
        })

      const ethAddr = await AddressService.getAddress('ethereum', 0)
      const polyAddr = await AddressService.getAddress('polygon', 0)

      expect(ethAddr).toBe(ethereumAddress)
      expect(polyAddr).toBe(polygonAddress)
      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(2)
    })

    it('should handle different account indices', async () => {
      const address0 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const address1 = '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      mockHRPC.callMethod
        .mockResolvedValueOnce({
          result: JSON.stringify(address0),
        })
        .mockResolvedValueOnce({
          result: JSON.stringify(address1),
        })

      const addr0 = await AddressService.getAddress('ethereum', 0)
      const addr1 = await AddressService.getAddress('ethereum', 1)

      expect(addr0).toBe(address0)
      expect(addr1).toBe(address1)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          network: 'ethereum',
          accountIndex: 0,
        })
      )
      expect(mockHRPC.callMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          network: 'ethereum',
          accountIndex: 1,
        })
      )
    })

    it('should throw error if WDK not initialized', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false,
        hrpc: null,
      }))
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {},
        walletLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow(
        'WDK not initialized'
      )
    })

    it('should throw error if HRPC not available', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: true,
        hrpc: null,
      }))
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {},
        walletLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow(
        'WDK not initialized'
      )
    })

    it('should throw error if worklet call fails', async () => {
      mockHRPC.callMethod.mockRejectedValue(new Error('Worklet error'))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow()
    })

    it('should throw error if worklet returns no result', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: null,
      })
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {},
        walletLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow(
        /Failed to get address|Expected string/
      )
    })

    it('should validate network name', async () => {
      await expect(AddressService.getAddress('', 0)).rejects.toThrow(
        /network.*non-empty|Network name must contain only|String must contain at least 1 character/
      )
    })

    it('should validate account index', async () => {
      await expect(AddressService.getAddress('ethereum', -1)).rejects.toThrow(
        /accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i
      )
    })

    it('should handle all networks from the configuration', async () => {
      const networks = ['ethereum', 'polygon', 'arbitrum', 'sepolia', 'plasma', 'spark']
      // Use valid Ethereum address for most networks, Spark address for spark
      const mockEthereumAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const mockSparkAddress = 'spark1abcdefghijklmnopqrstuvwxyz123456'

      for (const network of networks) {
        const mockAddress = network === 'spark' ? mockSparkAddress : mockEthereumAddress
        mockHRPC.callMethod.mockResolvedValueOnce({
          result: JSON.stringify(mockAddress),
        })
        
        const address = await AddressService.getAddress(network, 0)
        expect(address).toBe(mockAddress)
        expect(mockHRPC.callMethod).toHaveBeenCalledWith(
          expect.objectContaining({
            network,
            accountIndex: 0,
          })
        )
      }

      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(networks.length)
    })

    it('should set loading state during address fetch', async () => {
      const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockAddress),
      })

      await AddressService.getAddress('ethereum', 0)

      // Verify loading state was set to true, then false
      const setStateCalls = mockWalletStore.setState.mock.calls
      expect(setStateCalls.length).toBeGreaterThan(0)

      // Track state changes - start with initial state
      let currentState: any = { 
        walletLoading: {}, 
        addresses: {},
        balanceLoading: {},
        lastBalanceUpdate: {},
        balances: {},
        activeWalletId: 'test-wallet-1',
      }
      let loadingWasSetToTrue = false
      let loadingWasSetToFalse = false

      for (const call of setStateCalls) {
        const stateUpdater = call[0]
        if (typeof stateUpdater === 'function') {
          // Ensure all required state properties exist
          const prevState = {
            walletLoading: currentState.walletLoading || {},
            addresses: currentState.addresses || {},
            balanceLoading: currentState.balanceLoading || {},
            lastBalanceUpdate: currentState.lastBalanceUpdate || {},
            balances: currentState.balances || {},
            activeWalletId: currentState.activeWalletId || 'test-wallet-1',
          }
          currentState = { ...prevState, ...stateUpdater(prevState) }
          // Loading state is now per-wallet: walletLoading[walletId][loadingKey]
          if (currentState.walletLoading?.['test-wallet-1']?.['ethereum-0'] === true) {
            loadingWasSetToTrue = true
          }
          if (currentState.walletLoading?.['test-wallet-1']?.['ethereum-0'] === false) {
            loadingWasSetToFalse = true
          }
        }
      }

      expect(loadingWasSetToTrue).toBe(true)
      expect(loadingWasSetToFalse).toBe(true)
    })

    it('should dedupe concurrent calls for the same key', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(address),
      })

      const p1 = AddressService.getAddress('ethereum', 0)
      const p2 = AddressService.getAddress('ethereum', 0)
      const results = await Promise.all([p1, p2])

      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(1)
      expect(results).toEqual([address, address])
    })

    it('should not dedupe different keys', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'),
      })

      await Promise.all([
        AddressService.getAddress('ethereum', 0),
        AddressService.getAddress('ethereum', 1),
        AddressService.getAddress('polygon', 0),
      ])

      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(3)
    })

    it('should not dedupe calls for different wallets', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'),
      })

      await Promise.all([
        AddressService.getAddress('ethereum', 0, 'wallet-a'),
        AddressService.getAddress('ethereum', 0, 'wallet-b'),
      ])

      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(2)
    })

    // Replays the sequence of setState updater functions against an initial
    // state, mirroring how the real zustand store would apply them.
    function replaySetStateCalls(setStateMock: jest.Mock) {
      let state: any = {
        walletLoading: {},
        addresses: {},
        balanceLoading: {},
        lastBalanceUpdate: {},
        balances: {},
        activeWalletId: 'test-wallet-1',
      }
      for (const [updater] of setStateMock.mock.calls) {
        state = typeof updater === 'function' ? { ...state, ...updater(state) } : { ...state, ...updater }
      }
      return state
    }

    // requireInitialized() awaits a couple of already-resolved promises
    // before hrpc.callMethod is actually invoked - flush enough microtask
    // ticks that it's guaranteed to have been called by the time we return.
    async function flushMicrotasks(times = 10) {
      for (let i = 0; i < times; i++) {
        await Promise.resolve()
      }
    }

    it('should skip the address-cache write after a worklet epoch bump, but still clear the loading flag', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      let resolveCallMethod: (value: { result: string }) => void
      mockHRPC.callMethod.mockImplementation(
        () => new Promise((resolve) => { resolveCallMethod = resolve }),
      )

      const pending = AddressService.getAddress('ethereum', 0, 'test-wallet-1')
      await flushMicrotasks()
      expect(mockHRPC.callMethod).toHaveBeenCalled()

      // Simulate a wallet switch/lock happening while the fetch is in flight.
      bumpEpoch()
      resolveCallMethod!({ result: JSON.stringify(address) })

      const result = await pending
      expect(result).toBe(address)

      // The stale fetch must not resurrect address data after the epoch changed...
      const finalState = replaySetStateCalls(mockWalletStore.setState)
      expect(finalState.addresses['test-wallet-1']).toBeUndefined()

      // ...but it must still clear the loading flag it set, so a future
      // getAddress call for this network/account isn't blocked forever.
      expect(finalState.walletLoading['test-wallet-1']?.['ethereum-0']).toBe(false)
    })

    it('should clear the loading flag even when the fetch fails after an epoch bump', async () => {
      let rejectCallMethod: (reason: Error) => void
      mockHRPC.callMethod.mockImplementation(
        () => new Promise((_resolve, reject) => { rejectCallMethod = reject }),
      )

      const pending = AddressService.getAddress('ethereum', 0, 'test-wallet-1')
      await flushMicrotasks()
      expect(mockHRPC.callMethod).toHaveBeenCalled()

      bumpEpoch()
      rejectCallMethod!(new Error('Worklet error'))

      await expect(pending).rejects.toThrow('Worklet error')

      const finalState = replaySetStateCalls(mockWalletStore.setState)
      expect(finalState.walletLoading['test-wallet-1']?.['ethereum-0']).toBe(false)
    })

    it('should start a fresh fetch after an epoch bump, instead of joining the stale in-flight promise', async () => {
      const staleAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const freshAddress = '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      mockHRPC.callMethod
        .mockResolvedValueOnce({ result: JSON.stringify(staleAddress) })
        .mockResolvedValueOnce({ result: JSON.stringify(freshAddress) })

      const stale = AddressService.getAddress('ethereum', 0, 'test-wallet-1')
      bumpEpoch()

      const fresh = AddressService.getAddress('ethereum', 0, 'test-wallet-1')
      const [staleResult, freshResult] = await Promise.all([stale, fresh])

      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(2)
      expect(staleResult).toBe(staleAddress)
      expect(freshResult).toBe(freshAddress)
    })
  })
})

