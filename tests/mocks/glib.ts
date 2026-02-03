// Mock GLib module for testing
export class MockGLib {
  static SOURCE_REMOVE = false
  static SOURCE_CONTINUE = true
  static PRIORITY_DEFAULT = 0

  static get_home_dir(): string {
    return '/tmp/test-home'
  }

  static file_set_contents(path: string, contents: string): void {
    // Mock implementation - would write to in-memory storage in real tests
    console.log(`[Mock] GLib.file_set_contents: ${path}`)
  }

  static timeout_add(priority: number, interval: number, callback: () => boolean): number {
    // Return a mock timer ID
    return Math.floor(Math.random() * 10000)
  }

  static source_remove(id: number): void {
    // Mock - do nothing
  }
}

export default MockGLib
