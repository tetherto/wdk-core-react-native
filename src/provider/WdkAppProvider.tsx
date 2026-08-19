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

import React, { createContext, useMemo, useRef, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useWalletOrchestrator } from '../hooks/internal/useWalletOrchestrator'
import { useWorkletInitializer } from '../hooks/internal/useWorkletInitializer'

import { WalletSetupService } from '../services/walletSetupService'
import { normalizeError } from '../utils/errorUtils'
import { logError } from '../utils/logger'
import { validateWdkConfigs } from '../utils/validation'
import {
  DEFAULT_QUERY_GC_TIME_MS,
  DEFAULT_QUERY_STALE_TIME_MS,
} from '../utils/constants'
import type { WdkConfigs, BundleConfig } from '../types'

export type WdkAppState =
  /** The worklet hasn't started yet, or there isn't enough information yet
   * to report anything more specific (e.g. the worklet has started but no
   * identity or wallets are known - nothing has been created/restored/
   * unlocked this session, and nothing has told the SDK who the user is). */
  | { status: 'INITIALIZING' }
  /** The worklet is being manually reinitialized via reinitializeWdk(). */
  | { status: 'REINITIALIZING' }
  /** No wallet exists at all - walletList is confirmed empty, so this is a
   * genuinely fresh device/user. Safe to route to onboarding
   * (create/restore). */
  | { status: 'NO_WALLET' }
  /** No wallet is currently unlocked. walletId is present when a specific
   * wallet is targeted (e.g. unlock()/switchWallet() was called and is still
   * mid-decrypt) and absent when a wallet is only known to exist (from
   * walletList) but none is currently targeted (e.g. right after lock()).
   * Either way, the correct action is the same: show your own unlock flow,
   * using walletId as an optional hint rather than a required one. */
  | { status: 'LOCKED'; walletId?: string }
  /** A wallet is fully unlocked and its identity has been confirmed to
   * match what's actually loaded. Safe to render the main app. */
  | { status: 'READY'; walletId: string }
  /** Something failed - inspect error for details. Can originate from
   * either the worklet layer or a wallet operation (create/unlock/etc). */
  | { status: 'ERROR'; error: Error };

export interface WdkAppContextValue {
  state: WdkAppState;
}

const WdkAppContext = createContext<WdkAppContextValue | null>(null)

export interface WdkAppProviderProps<
  TNetwork extends Record<string, unknown> = Record<string, unknown>,
  TProtocol extends Record<string, unknown> = Record<string, unknown>,
> {
  bundle: BundleConfig
  wdkConfigs: WdkConfigs<TNetwork, TProtocol>
  children: React.ReactNode
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
    },
  },
})

export function WdkAppProvider<
  TNetwork extends Record<string, unknown> = Record<string, unknown>,
  TProtocol extends Record<string, unknown> = Record<string, unknown>,
>({
  bundle: bundleConfig,
  wdkConfigs,
  children,
}: WdkAppProviderProps<TNetwork, TProtocol>) {
  // Synchronous service setup (must run before child effects)
  const secureStorageInitialized = useRef<boolean | undefined>(undefined)
  const secureStorage = useMemo(() => createSecureStorage(), [])

  if (secureStorageInitialized.current == null) {
    WalletSetupService.setSecureStorage(secureStorage)
    secureStorageInitialized.current = true
  }

  useEffect(() => {
    try {
      validateWdkConfigs(wdkConfigs)
    } catch (error) {
      const err = normalizeError(error, true, {
        component: 'WdkAppProvider',
        operation: 'propsValidation',
      })
      logError('[WdkAppProviderV2] Invalid props:', err)
      throw err
    }
  }, [wdkConfigs])

  const {
    isWorkletStarted,
    isInitialized: isWorkletInitialized,
    isReinitialized: isWdkReinitialized,
    error: workletError,
  } = useWorkletInitializer({
    bundleConfig,
    wdkConfigs,
  })

  const { state } = useWalletOrchestrator({
    isWorkletStarted,
    isWorkletInitialized,
    isWdkReinitialized,
    workletError,
  })

  const contextValue: WdkAppContextValue = useMemo(
    () => ({
      state,
    }),
    [state],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <WdkAppContext.Provider value={contextValue}>
        {children}
      </WdkAppContext.Provider>
    </QueryClientProvider>
  )
}

export { WdkAppContext }
