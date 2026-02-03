# Bartender Test Infrastructure

This directory contains the test infrastructure for the Bartender status bar.

## Setup

Install test dependencies:

```bash
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── mocks/           # Mock implementations for GLib, Gio, etc.
│   ├── glib.ts      # GLib mock (timers, file operations)
│   └── gio.ts       # Gio mock (file I/O, monitoring)
├── services/        # Service tests
│   ├── feed.test.ts    # FeedService tests
│   └── config.test.ts  # ConfigService tests
├── setup.ts         # Test setup and global mocks
└── README.md        # This file
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should do something', () => {
    expect(true).toBe(true)
  })
})
```

### Mocking GLib/Gio

The test setup automatically mocks GLib and Gio imports. Access mock implementations:

```typescript
import GLib from 'gi://GLib'
import Gio from 'gi://Gio'

// These will be the mock implementations
const file = Gio.File.new_for_path('/tmp/test')
```

### Mocking execAsync

```typescript
import { vi } from 'vitest'
import { execAsync } from 'ags/process'

it('should call curl', async () => {
  const mockExec = vi.mocked(execAsync)
  mockExec.mockResolvedValue('response data')

  // Your test code here

  expect(mockExec).toHaveBeenCalledWith(['curl', '-s', 'url'])
})
```

### Testing File Operations

```typescript
import Gio from 'gi://Gio'

it('should create file', () => {
  const file = Gio.File.new_for_path('/tmp/test.txt')

  // Set mock state
  file._setExists(true)
  file._setContents('test content')

  expect(file.query_exists(null)).toBe(true)

  const [success, contents] = file.load_contents(null)
  expect(success).toBe(true)
})
```

## Test Coverage

Current test files demonstrate patterns for:

- RSS feed parsing and error recovery
- HTTP caching with ETag/Last-Modified
- Memory management (bounded maps, TTL pruning)
- Log rotation (size and age-based)
- Article selection algorithms (weighting, diversity)
- TOML configuration parsing
- Config file watching and debouncing
- Widget enable/disable logic
- Configuration migration
- Input validation

## Notes

- Tests use Vitest for fast, modern testing
- Mocks simulate GLib/Gio behavior for unit testing
- Some tests are placeholders demonstrating patterns
- Full integration tests would require running AGS environment
- Focus on testing business logic and algorithms

## Future Improvements

- Add widget component tests
- Mock AstalWp for audio tests
- Add integration tests with test fixtures
- Increase coverage to >80%
- Add performance benchmarks
