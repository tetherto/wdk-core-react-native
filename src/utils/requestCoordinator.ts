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
 * Coordinates concurrent fetches that get cached into the wallet store:
 * dedupes concurrent calls for the same key, and discards a result if the
 * worklet's loaded wallet changed while it was in flight, instead of
 * committing stale data. Each domain (addresses, balances, ...) should use
 * its own instance.
 */
import { getEpoch } from './workletEpoch'
import { log } from './logger'

export class RequestCoordinator {
  private inflight = new Map<string, Promise<unknown>>()

  /**
   * Runs `fetch` for `key`, sharing the in-flight promise with any
   * concurrent caller using the same key. If the worklet's loaded wallet is
   * still the same one as when `fetch` started, `commit` is called with the
   * result; otherwise the result is discarded.
   */
  async run<T>(
    key: string,
    fetch: () => Promise<T>,
    commit: (result: T) => void,
  ): Promise<T> {
    const epoch = getEpoch()
    const fullKey = `${epoch}:${key}`

    const existing = this.inflight.get(fullKey)
    if (existing) {
      return existing as Promise<T>
    }

    const promise = fetch()
    this.inflight.set(fullKey, promise)

    try {
      const result = await promise
      if (epoch === getEpoch()) {
        commit(result)
      } else {
        log('[RequestCoordinator] Discarding stale result', { key })
      }
      return result
    } finally {
      if (this.inflight.get(fullKey) === promise) {
        this.inflight.delete(fullKey)
      }
    }
  }
}
