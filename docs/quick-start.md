# Quick Start: A Complete Example

This document provides a complete, copy-pasteable code example for setting up and using the WDK.

**Prerequisites:** Before using this guide, make sure you have already followed the **Installation** and **Bundle Configuration** steps in the main `README.md`. You should have:
1.  The necessary packages installed.
2.  A `.wdk` directory containing your generated worklet bundle.

---

## Step 1: Configure Your Runtime Providers

Create a configuration file (e.g., `src/config.ts`) that defines the runtime providers for the networks you included in your worklet bundle.

```typescript
// src/config.ts
export const wdkConfigs = {
  networks: {
    ethereum: {
      blockchain: 'ethereum',
      config: {
        chainId: 1,
        provider: 'https://eth.drpc.org'
      }
    }
  }
};
```

---

## Step 2: Build Your App Component

In your main application file (e.g., `App.tsx`), import the `bundle`, your `wdkConfigs`, and the WDK hooks. Then, wrap your app in the `WdkAppProvider` and use the hooks to build your wallet logic.

```typescript
// App.tsx
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import {
  WdkAppProvider,
  useWdkApp,
  useWalletManager,
  useAddresses,
} from '@tetherto/wdk-react-native-core';

// Import the generated bundle and your configuration
import { bundle } from './.wdk';
import { wdkConfigs } from './src/config';

// Main App component
function App() {
  return (
    <WdkAppProvider
      bundle={{ bundle }}
      wdkConfigs={wdkConfigs}
    >
      <MyWalletComponent />
    </WdkAppProvider>
  );
}

// Component that uses the wallet hooks
function MyWalletComponent() {
  const { state } = useWdkApp();
  const { createWallet, unlock } = useWalletManager();
  const { addresses, loadAddresses } = useAddresses();

  // Identity is caller-owned: the library never picks a wallet id for you.
  // Replace this with your own app's user/session id.
  const userId = 'demo-user';

  useEffect(() => {
    const setupWallet = async () => {
      if (state.status === 'NO_WALLET') {
        await createWallet(userId);
      } else if (state.status === 'LOCKED') {
        // In a real app, gate this behind your own auth check
        // (biometrics, passcode, etc.) before calling unlock.
        await unlock(userId);
      } else {
        return;
      }
      // After the wallet is ready, load addresses for account 0
      loadAddresses([0]);
    };
    setupWallet();
  }, [state.status, createWallet, unlock, loadAddresses]);

  // Find the first Ethereum address from the loaded addresses
  const ethAddress = addresses.find(a => a.network === 'ethereum')?.address;

  return (
    <View>
      <Text>App Status: {state.status}</Text>
      {ethAddress ? (
        <Text>Your ETH Address: {ethAddress}</Text>
      ) : (
        <Text>Loading wallet and address...</Text>
      )}
    </View>
  );
}

export default App;
```
