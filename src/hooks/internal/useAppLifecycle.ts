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

import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { WorkletLifecycleService } from '../../services/workletLifecycleService'
import { getWalletStore } from '../../store/walletStore'
import { updateWalletLoadingState } from '../../store/walletStore'
import { clearAllSensitiveData, getWorkletStore } from '../../store/workletStore'
import { log, logError } from '../../utils/logger'

/** Debounce foreground transitions (e.g. Android inactive flakiness). */
const FOREGROUND_WDK_REINIT_DEBOUNCE_MS = 200

export interface UseAppLifecycleProps {
  clearSensitiveDataOnBackground: boolean
}

export function useAppLifecycle({
  clearSensitiveDataOnBackground,
}: UseAppLifecycleProps): void {
  useEffect(() => {
    if (!clearSensitiveDataOnBackground) {
      return
    }

    // CRITICAL: Clear cache on mount to handle true app restarts (not hot reloads)
    log('[useAppLifecycle] Clearing credentials cache on mount (app restart)')
    clearAllSensitiveData()
  }, [clearSensitiveDataOnBackground])

  useEffect(() => {
    const appStateRef = { current: AppState.currentState }
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleForegroundWdkReinit = () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        const ws = getWorkletStore().getState()
        if (
          !ws.isWorkletStarted ||
          !ws.isInitialized ||
          ws.isLoading ||
          !ws.encryptionKey ||
          !ws.encryptedSeed
        ) {
          return
        }
        void WorkletLifecycleService.initializeWDK({
          encryptionKey: ws.encryptionKey,
          encryptedSeed: ws.encryptedSeed,
        }).catch((err) => {
          logError('[useAppLifecycle] Foreground WDK reinit failed', err)
        })
      }, FOREGROUND_WDK_REINIT_DEBOUNCE_MS)
    }

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        const previousState = appStateRef.current
        appStateRef.current = nextAppState

        if (clearSensitiveDataOnBackground) {
          if (
            (nextAppState === 'background' || nextAppState === 'inactive') &&
            previousState === 'active'
          ) {
            log(
              '[useAppLifecycle] App going to background - clearing sensitive data and marking for re-auth',
            )
            clearAllSensitiveData()

            const walletStore = getWalletStore()
            const currentState = walletStore.getState()
            const currentStateType = currentState.walletLoadingState.type

            if (currentStateType === 'ready' && currentState.activeWalletId) {
              log(
                '[useAppLifecycle] Resetting wallet state to trigger biometrics on foreground',
              )
              walletStore.setState((prev) =>
                updateWalletLoadingState(prev, {
                  type: 'not_loaded',
                }),
              )
            } else if (
              currentStateType === 'loading' ||
              currentStateType === 'checking'
            ) {
              log(
                '[useAppLifecycle] Preserving wallet loading state during background transition',
                {
                  currentState: currentStateType,
                },
              )
            }
          }
        }

        if (
          nextAppState === 'active' &&
          (previousState === 'background' || previousState === 'inactive')
        ) {
          if (clearSensitiveDataOnBackground) {
            log(
              '[useAppLifecycle] App coming to foreground - auto-initialization will trigger biometrics',
            )
          }
          scheduleForegroundWdkReinit()
        }
      },
    )

    return () => {
      subscription.remove()
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
    }
  }, [clearSensitiveDataOnBackground])
}
