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

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { create, StoreApi } from 'zustand';
import { useMultiAddressLoader } from '../../src/hooks/useMultiAddressLoader';
import { AccountService } from '../../src/services/accountService';
import { getWalletStore } from '../../src/store/walletStore';
import { logError } from '../../src/utils/logger';

jest.mock('../../src/services/accountService');
jest.mock('../../src/store/walletStore');
jest.mock('../../src/utils/logger', () => ({
    log: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

const mockCallAccountMethod = AccountService.callAccountMethod as jest.Mock;
const mockGetWalletStore = getWalletStore as jest.Mock;
const mockLogError = logError as jest.Mock;

describe('useMultiAddressLoader', () => {
    let mockWalletStore: StoreApi<{ activeWalletId: string | null }>;
    const walletId = 'wallet1';
    
    beforeEach(() => {
        jest.clearAllMocks();
        mockWalletStore = create(() => ({ activeWalletId: walletId }));
        mockGetWalletStore.mockReturnValue(mockWalletStore);
    });

    it('should not fetch if enabled is false', () => {
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1'], accountIndex: 0, enabled: false }));
        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockCallAccountMethod).not.toHaveBeenCalled();
    });

    it('should not fetch if networks array is empty', () => {
        const { result } = renderHook(() => useMultiAddressLoader({ networks: [], accountIndex: 0 }));
        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockCallAccountMethod).not.toHaveBeenCalled();
    });

    it('should not fetch if activeWalletId is null', () => {
        mockWalletStore.setState({ activeWalletId: null });
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1'], accountIndex: 0 }));
        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockCallAccountMethod).not.toHaveBeenCalled();
    });
    
    it('should set loading state and fetch addresses successfully', async () => {
        mockCallAccountMethod.mockImplementation(async (network) => {
            return `${network}-address`;
        });
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1', 'net2'], accountIndex: 0 }));
        
        expect(result.current.isLoading).toBe(true);
        expect(result.current.addresses).toBe(null);
        expect(result.current.error).toBe(null);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockCallAccountMethod).toHaveBeenCalledTimes(2);
        expect(mockCallAccountMethod).toHaveBeenCalledWith('net1', 0, 'getAddress');
        expect(mockCallAccountMethod).toHaveBeenCalledWith('net2', 0, 'getAddress');
        expect(result.current.addresses).toEqual([
            { network: 'net1', address: 'net1-address' },
            { network: 'net2', address: 'net2-address' },
        ]);
        expect(result.current.error).toBe(null);
    });

    it('should handle duplicate networks and preserve original order', async () => {
        mockCallAccountMethod.mockImplementation(async (network) => `${network}-address`);
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net2', 'net1', 'net2'], accountIndex: 0 }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        
        expect(mockCallAccountMethod).toHaveBeenCalledTimes(2);
        expect(mockCallAccountMethod).toHaveBeenCalledWith('net1', 0, 'getAddress');
        expect(mockCallAccountMethod).toHaveBeenCalledWith('net2', 0, 'getAddress');

        expect(result.current.addresses).toEqual([
            { network: 'net2', address: 'net2-address' },
            { network: 'net1', address: 'net1-address' },
            { network: 'net2', address: 'net2-address' }
        ]);
    });

    it('should handle errors from the service', async () => {
        const error = new Error('Service Error');
        mockCallAccountMethod.mockRejectedValue(error);
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1'], accountIndex: 0 }));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.error).toBe(error);
        expect(result.current.addresses).toBe(null);
        expect(mockLogError).toHaveBeenCalledWith('useMultiAddressLoader failed:', error);
    });

    it('should re-fetch when dependencies change', async () => {
        mockCallAccountMethod.mockResolvedValue('address-1');
        const { rerender } = renderHook(
            (props) => useMultiAddressLoader(props),
            { initialProps: { networks: ['net1'], accountIndex: 0 } }
        );

        await waitFor(() => expect(mockCallAccountMethod).toHaveBeenCalledTimes(1));

        mockCallAccountMethod.mockResolvedValue('address-2');
        rerender({ networks: ['net1'], accountIndex: 1 });
        await waitFor(() => expect(mockCallAccountMethod).toHaveBeenCalledTimes(2));
        expect(mockCallAccountMethod).toHaveBeenCalledWith('net1', 1, 'getAddress');

        mockCallAccountMethod.mockResolvedValue('address-3');
        rerender({ networks: ['net2'], accountIndex: 1 });
        await waitFor(() => expect(mockCallAccountMethod).toHaveBeenCalledTimes(3));
        expect(mockCallAccountMethod).toHaveBeenCalledWith('net2', 1, 'getAddress');
        
        mockCallAccountMethod.mockResolvedValue('address-4');
        act(() => {
          mockWalletStore.setState({ activeWalletId: 'wallet2' });
        });
        await waitFor(() => expect(mockCallAccountMethod).toHaveBeenCalledTimes(4));
    });

    it('should reset state when disabled', async () => {
        mockCallAccountMethod.mockResolvedValue('address-1');
        const { result, rerender } = renderHook(
            (props) => useMultiAddressLoader(props),
            { initialProps: { networks: ['net1'], accountIndex: 0, enabled: true } }
        );

        await waitFor(() => expect(result.current.addresses).not.toBeNull());

        rerender({ networks: ['net1'], accountIndex: 0, enabled: false });

        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockCallAccountMethod).toHaveBeenCalledTimes(1);
    });
});
