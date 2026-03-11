# Best Practices

This document highlights important patterns and practices to help you build robust, maintainable apps with WDK.

---

## 1. Use Strongly-Typed Configurations

**Problem:** The `wdkConfigs` object can be complex, and it's easy to make typos or forget required fields for a specific network.

**Best Practice:** The `WdkConfigs` type is generic. You can, and should, pass it a union of the specific configuration types for the wallets you are using. These types are exported from their respective wallet packages.

This gives you full TypeScript support, including autocompletion and type-checking, directly in your editor.

### Example

```typescript
import type { WdkConfigs } from '@tetherto/wdk-react-native-core';
import { type EvmErc4337WalletConfig } from '@tetherto/wdk-wallet-evm-erc-4337';
import { type BtcWalletConfig } from '@tetherto/wdk-wallet-btc';

// Create a union of the config types you will use
type AppWalletConfigs = EvmErc4337WalletConfig | BtcWalletConfig;

// Use the union type as a generic for WdkConfigs
export const wdkConfigs: WdkConfigs<AppWalletConfigs> = {
  networks: {
    ethereum: {
      blockchain: 'ethereum',
      config: {
        // All these properties are now type-checked and auto-completed
        chainId: 1,
        provider: 'https://eth.drpc.org',
        bundlerUrl: '...' // etc.
      }
    },
    bitcoin: {
      blockchain: 'bitcoin',
      config: {
        network: 'testnet', // Type error if you use an invalid value
        host: 'api.ordimint.com'
      }
    }
  }
};
```

---

## 2. Standardize and Extend Assets

**Problem:** Managing token information (contract addresses, decimals), related business logic, or **UI data like icons** can become scattered and inconsistent.

**Best Practice:** The library provides two primitives to solve this: the `AssetConfig` interface and the `BaseAsset` class.

1.  **Standardize with `AssetConfig`:** Define all your supported tokens in a single, centralized configuration object.
2.  **Extend `BaseAsset`:** For tokens that require special logic or **UI-specific data** (e.g., distinguishing stablecoins, providing an icon component), create your own class that extends `BaseAsset` and add your custom methods.

This approach makes your asset management scalable and encapsulates token-specific logic cleanly.

### Example

```typescript
import { AssetConfig, BaseAsset } from '@tetherto/wdk-react-native-core';
import { UsdtIcon, EthIcon } from './MyIconComponents'; // Example import

// 1. Define all assets in a central config object
export const tokenConfigs: Record<string, AssetConfig> = {
  'ethereum-eth': {
    id: 'ethereum-eth',
    address: null,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    network: 'ethereum'
  },
  'ethereum-usdt': {
    id: 'ethereum-usdt',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    isNative: false,
    network: 'ethereum'
  }
};

// 2. Extend BaseAsset for custom logic and UI data
export class MyProjectToken extends BaseAsset {
  constructor(config: AssetConfig) {
    super(config);
  }

  isStablecoin(): boolean {
    return this.getSymbol() === 'USDT';
  }

  // Add a method to return a UI component for the token
  getIconComponent(): () => React.JSX.Element {
    if (this.getSymbol() === 'USDT') {
      return UsdtIcon;
    }
    // Return a default or other icon
    return EthIcon;
  }
}

// How to use it:
const usdtConfig = tokenConfigs['ethereum-usdt'];
const usdtToken = new MyProjectToken(usdtConfig);
const IconToRender = usdtToken.getIconComponent();
// Now you can use <IconToRender /> in your component's JSX
```

---

## 3. Accessing Chain-Specific APIs with Extensions

**Problem:** Different blockchains have unique features that aren't part of the standard wallet interface (e.g., Spark's static deposit addresses). You need a way to access this special functionality in a type-safe manner.

**Best Practice:** The `useAccount` hook is generic and can be parameterized with a specific account type imported from a wallet package. When you provide a type, the `account` object will be correctly typed, and if it includes an `extension()` method, that method will return a fully-typed object, giving you access to all of its unique APIs.

This pattern allows you to work with custom, chain-specific functionality without sacrificing the safety and autocompletion of TypeScript.

### Example

```typescript
import { useAccount } from '@tetherto/wdk-react-native-core';
import type { WalletAccountSpark } from '@tetherto/wdk-wallet-spark';

function MySparkComponent() {
  // Pass the specific account type to the useAccount hook
  const { account } = useAccount<WalletAccountSpark>({
    network: 'spark',
    accountIndex: 0,
  });

  const handleGetDepositAddress = async () => {
    // The extension() method now returns a fully-typed Spark extension object
    const sparkExtension = account?.extension();

    if (sparkExtension) {
      // You get autocompletion and type safety for chain-specific methods
      const depositAddress = await sparkExtension.getStaticDepositAddress();
      console.log('Spark Deposit Address:', depositAddress);
    }
  };

  // ...
}
```

---

## 4. Working with the Asynchronous Lifecycle

The library is fundamentally asynchronous. A wallet must be unlocked before you can get a balance or send a transaction. The library is designed to make this easy by providing several safe patterns for handling this asynchronous nature. You should rarely need to check `if (status === 'READY')` yourself.

### Pattern 1: The Reactive `useEffect` Pattern

This is the most robust pattern for triggering logic that should run **immediately after** a major lifecycle event, like a wallet unlock or restore.

**When to use it:** When you need to chain an action that depends on the result of another action (e.g., "after the wallet is restored, fetch the user's addresses").

**How it works:** An event handler *triggers* an action (like `unlock`), and a `useEffect` hook *reacts* to the resulting `status` change.

**Example:**

```javascript
import { useWalletManager, useAddresses } from '@tetherto/wdk-react-native-core';

// ... inside a component
const { unlock, status } = useWalletManager();
const { loadAddresses } = useAddresses();
const [isUnlockPending, setIsUnlockPending] = useState(false);

// Step 1: The handler just triggers the action.
const handleUnlock = async () => {
  setIsUnlockPending(true);
  try {
    await unlock(myWalletId);
  } catch (e) {
    setIsUnlockPending(false); // Let the effect handle success
  }
};

// Step 2: The effect reacts to the 'READY' status.
useEffect(() => {
  if (status === 'READY' && isUnlockPending) {
    const fetchInitialData = async () => {
      // ✅ CORRECT: The system is now guaranteed to be ready.
      const addresses = await loadAddresses([0]);
      console.log("Addresses are ready:", addresses);
      setIsUnlockPending(false); // Action is complete
    };
    fetchInitialData();
  }
}, [status, isUnlockPending, loadAddresses]);
```

### Pattern 2: The Imperative `await` Pattern

Many action-oriented hooks like `useAccount` have a built-in "gate." You can call them at any time, and they will internally wait for the library to be ready before executing.

**When to use it:** When you're triggering a single action from a user event, like clicking a "Send" button. This is the simplest pattern.

**How it works:** The hook function (e.g., `send` or `getBalance`) has an `await requireInitialized()` at the very beginning, which pauses the function until the wallet is unlocked.

**Example:**

```javascript
import { useAccount } from '@tetherto/wdk-react-native-core';

// ... inside a component
const { send } = useAccount({ accountIndex: 0, network: 'ethereum' });

const handleSend = async () => {
  try {
    // ✅ CORRECT: You can await the function directly.
    // If the wallet is locked, this line will pause until it's unlocked.
    // If it's already unlocked, it proceeds immediately.
    const result = await send({ to: '0x...', amount: '1000', asset: ethAsset });
    console.log('Transaction sent!', result.hash);
  } catch (e) {
    console.error('Send failed', e);
  }
};
```

### Pattern 3: The Declarative Query Pattern

For fetching data that should be cached, like balances, the library uses TanStack Query. These hooks are declarative and automatically handle waiting.

**When to use it:** Whenever you are fetching chain data that can become stale, such as balances (`useBalance`).

**How it works:** The `useQuery` inside the hook has an `enabled` property that is tied to the library's status. The query will be dormant and will not run until its conditions (e.g., `!!activeWalletId && !!address`) are met.

**Example:**

```javascript
import { useBalance } from '@tetherto/wdk-react-native-core';

// ... inside a component
const { data, isLoading, error } = useBalance(0, usdtAsset);

// ✅ CORRECT: This hook handles everything automatically.
// It will be in an `isLoading` state until the wallet is unlocked,
// the address is loaded, and the balance is fetched.
// You don't need to write any explicit waiting logic.

if (isLoading) {
  return <Spinner />;
}
// ... render balance
```
