# Error Handling Guidelines

This document outlines the standardized error handling patterns used across the wdk-core-react-native module.

## Principles

1. **Always normalize errors**: Use `normalizeError()` to convert any error-like value to a proper Error instance
2. **Sanitize in production**: Always sanitize error messages in production to prevent information leakage
3. **Provide context**: Include component and operation context when normalizing errors
4. **Log before throwing**: Log errors before re-throwing them for debugging
5. **Handle gracefully**: Don't crash the app - handle errors gracefully with user-friendly messages

## Standard Pattern

```typescript
import { normalizeError } from '../utils/errorUtils'
import { logError } from '../utils/logger'

try {
  // Operation that might fail
  await someOperation()
} catch (error) {
  const normalizedError = normalizeError(error, true, {
    component: 'ServiceName',
    operation: 'operationName'
  })
  logError('[ServiceName] Failed to perform operation:', normalizedError)
  throw normalizedError
}
```

## Error Recovery Strategies

### 1. Retryable Operations
For operations that might fail due to transient issues (network, temporary unavailability):

```typescript
try {
  await operation()
} catch (error) {
  // Log error
  const normalizedError = normalizeError(error, true, { component: 'Service', operation: 'operation' })
  logError('[Service] Operation failed:', normalizedError)
  
  // Store error for UI to display retry option
  setError(normalizedError)
  // Don't throw - allow user to retry
}
```

### 2. Critical Operations
For operations that must succeed (initialization, critical state changes):

```typescript
try {
  await criticalOperation()
} catch (error) {
  const normalizedError = normalizeError(error, true, { component: 'Service', operation: 'criticalOperation' })
  logError('[Service] Critical operation failed:', normalizedError)
  // Throw to prevent proceeding with invalid state
  throw normalizedError
}
```

### 3. Non-Critical Operations
For operations that can fail without breaking the app (caching, optional features):

```typescript
try {
  await optionalOperation()
} catch (error) {
  // Log but don't throw - operation is optional
  logWarn('[Service] Optional operation failed:', error)
  // Continue execution
}
```

## Error Context

Always provide context when normalizing errors:

```typescript
normalizeError(error, true, {
  component: 'ServiceName',      // Which component/service
  operation: 'operationName',     // What operation was being performed
  network?: string,              // Optional: which network
  accountIndex?: number          // Optional: which account
})
```

## Error Sanitization

Error sanitization is handled automatically by `normalizeError()` when `sanitize` is `true` (default in production). This:
- Removes sensitive data (keys, seeds, mnemonics)
- Masks file paths
- Preserves error type information
- Allows detailed errors in development mode

## Async Operations

For async operations, always:
1. Check abort signals if provided
2. Handle cancellation gracefully
3. Clean up resources on error

```typescript
async function operation(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new Error('Operation cancelled')
  }

  try {
    await doWork()
    
    // Check again after async operation
    if (signal?.aborted) {
      throw new Error('Operation cancelled')
    }
  } catch (error) {
    if (signal?.aborted) {
      // Don't log cancellation errors
      throw error
    }
    
    const normalizedError = normalizeError(error, true, { component: 'Service', operation: 'operation' })
    logError('[Service] Operation failed:', normalizedError)
    throw normalizedError
  }
}
```

## Service-Specific Patterns

### AddressService
- Always validate inputs before operations
- Throw errors for invalid addresses
- Log all failures with network and account context

### BalanceService
- Non-critical operations can fail silently
- Log warnings for balance fetch failures
- Store errors in state for UI display

### WorkletLifecycleService
- Critical operations must throw
- Log all failures with full context
- Clean up resources on error

### WalletSetupService
- Require biometric authentication
- Throw errors for authentication failures
- Log all setup operations

## Testing Error Handling

When testing error handling:
1. Test error normalization
2. Test error sanitization
3. Test error recovery
4. Test error context preservation
5. Test abort signal handling


