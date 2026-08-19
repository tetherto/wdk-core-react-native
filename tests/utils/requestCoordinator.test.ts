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
 * Tests for RequestCoordinator
 *
 * The underlying worklet epoch is a module-level singleton shared across the
 * whole file (see workletEpoch.test.ts), so assertions here compare
 * before/after transitions rather than hardcoded values.
 */

import { RequestCoordinator } from '../../src/utils/requestCoordinator'
import { bumpEpoch } from '../../src/utils/workletEpoch'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('RequestCoordinator', () => {
  describe('dedupe', () => {
    it('shares a single in-flight fetch for the same key', async () => {
      const coordinator = new RequestCoordinator()
      const fetch = jest.fn().mockResolvedValue('value')
      const commit = jest.fn()

      const [a, b] = await Promise.all([
        coordinator.run('key-1', fetch, commit),
        coordinator.run('key-1', fetch, commit),
      ])

      expect(a).toBe('value')
      expect(b).toBe('value')
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(commit).toHaveBeenCalledTimes(1)
      expect(commit).toHaveBeenCalledWith('value')
    })

    it('does not dedupe different keys', async () => {
      const coordinator = new RequestCoordinator()
      const fetch = jest.fn().mockResolvedValue('value')

      await Promise.all([
        coordinator.run('key-1', fetch, () => {}),
        coordinator.run('key-2', fetch, () => {}),
      ])

      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('starts a fresh call once the previous one has settled', async () => {
      const coordinator = new RequestCoordinator()
      const fetch = jest.fn().mockResolvedValue('value')

      await coordinator.run('key-1', fetch, () => {})
      await coordinator.run('key-1', fetch, () => {})

      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('cleans up the in-flight entry even when the fetch rejects', async () => {
      const coordinator = new RequestCoordinator()
      const error = new Error('boom')

      await expect(
        coordinator.run('key-1', () => Promise.reject(error), () => {}),
      ).rejects.toThrow('boom')

      const fetch = jest.fn().mockResolvedValue('fresh')
      const result = await coordinator.run('key-1', fetch, () => {})

      expect(result).toBe('fresh')
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('propagates rejection to every waiter sharing the in-flight fetch', async () => {
      const coordinator = new RequestCoordinator()
      const error = new Error('boom')
      const { promise, reject } = deferred<string>()

      const p1 = coordinator.run('key-1', () => promise, () => {})
      const p2 = coordinator.run('key-1', () => promise, () => {})

      reject(error)

      await expect(p1).rejects.toThrow('boom')
      await expect(p2).rejects.toThrow('boom')
    })

    it('does not call commit when the fetch rejects', async () => {
      const coordinator = new RequestCoordinator()
      const commit = jest.fn()

      await expect(
        coordinator.run('key-1', () => Promise.reject(new Error('boom')), commit),
      ).rejects.toThrow('boom')

      expect(commit).not.toHaveBeenCalled()
    })
  })

  describe('epoch fencing', () => {
    it('commits when the epoch has not changed since the fetch started', async () => {
      const coordinator = new RequestCoordinator()
      const commit = jest.fn()

      await coordinator.run('key-1', () => Promise.resolve('value'), commit)

      expect(commit).toHaveBeenCalledWith('value')
    })

    it('does not commit if the epoch was bumped while the fetch was in flight', async () => {
      const coordinator = new RequestCoordinator()
      const commit = jest.fn()
      const pending = deferred<string>()

      const call = coordinator.run('key-1', () => pending.promise, commit)

      bumpEpoch()
      pending.resolve('value')

      const result = await call
      expect(result).toBe('value')
      expect(commit).not.toHaveBeenCalled()
    })

    it('still returns the fetched value even when the result is discarded as stale', async () => {
      const coordinator = new RequestCoordinator()
      const pending = deferred<string>()

      const call = coordinator.run('key-1', () => pending.promise, () => {})

      bumpEpoch()
      pending.resolve('stale-but-still-returned')

      expect(await call).toBe('stale-but-still-returned')
    })

    it('does not reuse an in-flight fetch from a previous epoch - starts a fresh one instead', async () => {
      const coordinator = new RequestCoordinator()
      const stale = deferred<string>()
      const fetch = jest
        .fn()
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce('fresh')

      const staleCall = coordinator.run('wallet-a:eth:0', fetch, () => {})
      bumpEpoch()
      const freshCall = coordinator.run('wallet-a:eth:0', fetch, () => {})

      stale.resolve('stale')

      expect(await freshCall).toBe('fresh')
      expect(await staleCall).toBe('stale')
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('multiple instances', () => {
    it('does not affect in-flight entries under a different coordinator instance', async () => {
      const addressCoordinator = new RequestCoordinator()
      const balanceCoordinator = new RequestCoordinator()
      const other = deferred<string>()

      const otherCall = balanceCoordinator.run('wallet-b:eth:0', () => other.promise, () => {})
      // Using the same key on a different instance shouldn't disturb it.
      void addressCoordinator.run('wallet-b:eth:0', () => Promise.resolve('unrelated'), () => {})

      other.resolve('original')

      expect(await otherCall).toBe('original')
    })
  })
})
