import { vi } from 'vitest'
import MockGLib from './mocks/glib'
import MockGio from './mocks/gio'

// Mock GLib and Gio imports
vi.mock('gi://GLib', () => ({
  default: MockGLib,
}))

vi.mock('gi://Gio', () => ({
  default: MockGio,
}))

// Mock execAsync from ags/process
vi.mock('ags/process', () => ({
  execAsync: vi.fn((args: string[]) => {
    // Default mock implementation
    return Promise.resolve('')
  }),
}))

// Mock ags globals
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
