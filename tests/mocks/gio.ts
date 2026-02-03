// Mock Gio module for testing
export class MockFile {
  private path: string
  private exists: boolean = false
  private contents: Uint8Array | null = null

  constructor(path: string) {
    this.path = path
  }

  query_exists(cancellable: any): boolean {
    return this.exists
  }

  load_contents(cancellable: any): [boolean, Uint8Array] {
    if (!this.exists || !this.contents) {
      return [false, new Uint8Array()]
    }
    return [true, this.contents]
  }

  make_directory_with_parents(cancellable: any): void {
    this.exists = true
  }

  delete(cancellable: any): void {
    this.exists = false
    this.contents = null
  }

  query_info(attributes: string, flags: any, cancellable: any): MockFileInfo {
    return new MockFileInfo(this.contents?.length || 0)
  }

  enumerate_children(attributes: string, flags: any, cancellable: any): MockFileEnumerator {
    return new MockFileEnumerator([])
  }

  get_child(name: string): MockFile {
    return new MockFile(`${this.path}/${name}`)
  }

  move(destination: MockFile, flags: any, cancellable: any, progressCallback: any): void {
    destination.exists = this.exists
    destination.contents = this.contents
    this.exists = false
    this.contents = null
  }

  // Test helpers
  _setExists(exists: boolean): void {
    this.exists = exists
  }

  _setContents(contents: string | Uint8Array): void {
    if (typeof contents === 'string') {
      this.contents = new TextEncoder().encode(contents)
    } else {
      this.contents = contents
    }
    this.exists = true
  }
}

export class MockFileInfo {
  private size: number

  constructor(size: number) {
    this.size = size
  }

  get_size(): number {
    return this.size
  }

  get_name(): string {
    return 'test-file.log'
  }

  get_modification_date_time(): MockDateTime | null {
    return new MockDateTime(Date.now() / 1000)
  }
}

export class MockDateTime {
  private timestamp: number

  constructor(timestamp: number) {
    this.timestamp = timestamp
  }

  to_unix(): number {
    return this.timestamp
  }
}

export class MockFileEnumerator {
  private files: MockFileInfo[]
  private index: number = 0

  constructor(files: MockFileInfo[]) {
    this.files = files
  }

  next_file(cancellable: any): MockFileInfo | null {
    if (this.index >= this.files.length) {
      return null
    }
    return this.files[this.index++]
  }

  close(cancellable: any): void {
    // Mock - do nothing
  }
}

export class MockFileMonitor {
  private callback: ((monitor: any, file: any, otherFile: any, eventType: any) => void) | null = null

  connect(signal: string, callback: (monitor: any, file: any, otherFile: any, eventType: any) => void): void {
    if (signal === 'changed') {
      this.callback = callback
    }
  }

  cancel(): void {
    this.callback = null
  }

  // Test helper to trigger events
  _triggerChange(eventType: any): void {
    if (this.callback) {
      this.callback(this, null, null, eventType)
    }
  }
}

export class MockGio {
  static FileQueryInfoFlags = {
    NONE: 0,
  }

  static FileMonitorFlags = {
    NONE: 0,
  }

  static FileMonitorEvent = {
    CHANGED: 0,
    CREATED: 1,
    DELETED: 2,
    CHANGES_DONE_HINT: 3,
  }

  static FileCopyFlags = {
    NONE: 0,
  }

  static File = {
    new_for_path(path: string): MockFile {
      return new MockFile(path)
    }
  }
}

export default MockGio
