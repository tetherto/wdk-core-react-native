# Quick Start: A Complete Example

This document provides a complete, copy-pasteable example for setting up the WDK and running your first component.

## Step 1: Generate the Worklet Bundle

The WDK relies on a worklet bundle for its core logic. Use the `@tetherto/wdk-worklet-bundler` to generate it.

### 1a. Install Tools and Modules
First, install the bundler and the required WDK modules.

```bash
# Install the bundler CLI globally
npm install -g @tetherto/wdk-worklet-bundler

# Install required WDK modules in your project
npm install @tetherto/wdk @tetherto/wdk-wallet-evm-erc-4337
```

### 1b. Create `wdk.config.js`
Run the `init` command to create a `wdk.config.js` file in your project's root. This file defines the networks and modules for your bundle.

```bash
wdk-worklet-bundler init
```

For this example, your `wdk.config.js` should look like this:

```javascript
// wdk.config.js
module.exports = {
  modules: {
    core: '@tetherto/wdk',
    erc4337: '@tetherto/wdk-wallet-evm-erc-4337',
  },
  networks: {
    ethereum: {
      module: 'erc4337',
      chainId: 1,
      blockchain: 'ethereum',
      provider: 'https://eth.drpc.org',
    },
  },
};
```

### 1c. Generate the Bundle
Run the `generate` command:

```bash
wdk-worklet-bundler generate
```

You should now see a **`.wdk`** directory in your project root. This contains the `bundle.js` that you will import in your app.

---

## Step 2: Configure Runtime Providers

Create a configuration file for the runtime providers that will be used in your app. This should match the networks you defined in `wdk.config.js`.

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

## Step 3: Main Application Entry Point (`App.tsx`)

Finally, import the generated bundle and your configs into your main app component and use the WDK hooks.

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
  const { isReady } = useWdkApp();
  const { createWallet, loadWallet, hasWallet } = useWalletManager();
  const { addresses, loadAddresses } = useAddresses();

  useEffect(() => {
    if (isReady) {
      const setupWallet = async () => {
        const walletExists = await hasWallet();
        if (walletExists) {
          await loadWallet();
        } else {
          await createWallet();
        }
        // After wallet is ready, load addresses for account 0
        loadAddresses([0]);
      };
      setupWallet();
    }
  }, [isReady, hasWallet, createWallet, loadWallet, loadAddresses]);

  // Find the first Ethereum address from the loaded addresses
  const ethAddress = addresses.find(a => a.network === 'ethereum')?.address;

  return (
    <View>
      <Text>App Status: {isReady ? 'Ready' : 'Initializing...'}</Text>
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
