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
 * Tests for workletEpoch
 *
 * The epoch is a true module-level singleton (intentionally - it's the one
 * global invalidation signal shared by every RequestCoordinator instance),
 * so these tests assert relative transitions rather than absolute values.
 */

import { getEpoch, bumpEpoch } from '../../src/utils/workletEpoch'

describe('workletEpoch', () => {
  it('stays the same across repeated reads without a bump', () => {
    const epoch = getEpoch()

    expect(getEpoch()).toBe(epoch)
    expect(getEpoch()).toBe(epoch)
  })

  it('strictly increases by one on each bumpEpoch call', () => {
    const before = getEpoch()

    bumpEpoch()

    expect(getEpoch()).toBe(before + 1)
  })

  it('accumulates across multiple bumps', () => {
    const before = getEpoch()

    bumpEpoch()
    bumpEpoch()
    bumpEpoch()

    expect(getEpoch()).toBe(before + 3)
  })

  it('never decreases or wraps back to a previously seen value', () => {
    const seen = new Set<number>()

    for (let i = 0; i < 5; i++) {
      seen.add(getEpoch())
      bumpEpoch()
    }

    expect(seen.size).toBe(5)
  })
})
