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

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  getWalletStore,
  type WalletStore,
} from '../../store/walletStore'
import type { WdkAppState } from '../../provider/WdkAppProvider'

export interface UseWalletOrchestratorProps {
  isWorkletStarted: boolean
  isWorkletInitialized: boolean
  isWdkReinitialized: boolean
  workletError: string | null
}

export function useWalletOrchestrator({
  isWorkletStarted,
  isWorkletInitialized,
  isWdkReinitialized: isWorkletReinitialized,
  workletError,
}: UseWalletOrchestratorProps) {
  const walletStore = getWalletStore()

  const { activeWalletId, walletLoadingState, wallets } = walletStore(
    useShallow((state: WalletStore) => ({
      activeWalletId: state.activeWalletId,
      walletLoadingState: state.walletLoadingState,
      wallets: state.walletList,
    })),
  )

  const state = useMemo((): WdkAppState => {
    const walletError =
      walletLoadingState.type === 'error' ? walletLoadingState.error : null
    const topLevelError = workletError ? new Error(workletError) : walletError

    if (topLevelError) {
      return { status: 'ERROR', error: topLevelError }
    }

    if (
      isWorkletInitialized &&
      activeWalletId &&
      walletLoadingState.type === 'ready' &&
      walletLoadingState.identifier === activeWalletId
    ) {
      return { status: 'READY', walletId: activeWalletId }
    }

    if (isWorkletStarted && isWorkletReinitialized) {
      return { status: 'REINITIALIZING'}
    }

    if (isWorkletStarted && activeWalletId) {
      return { status: 'LOCKED', walletId: activeWalletId }
    }

    if (isWorkletStarted && !activeWalletId) {
      return wallets.length > 0
        ? { status: 'LOCKED' }
        : { status: 'NO_WALLET' }
    }

    return { status: 'INITIALIZING' }
  }, [
    workletError,
    walletLoadingState,
    isWorkletInitialized,
    isWorkletStarted,
    activeWalletId,
    isWorkletReinitialized,
    wallets,
  ])

  return {
    state,
  }
}
