// Applies a BPS patch to its source. Every check has its own message, so a wrong source, a corrupt
// patch and a truncated patch read differently on the page.
import {
  BPS_FOOTER_SIZE,
  BPS_MAGIC,
  BpsAction,
  BpsError,
  PatchReader,
  readUint32,
} from './bps-format.ts'
import { crc32 } from './crc32.ts'

interface Header {
  sourceSize: number
  targetSize: number
  commandsStart: number
  commandsEnd: number
}

interface Command {
  action: BpsAction
  length: number
}

interface Cursor {
  reader: PatchReader
  source: Uint8Array
  target: Uint8Array
  output: number
  sourceOffset: number
  targetOffset: number
}

const MIN_PATCH_SIZE = BPS_MAGIC.length + 3 + BPS_FOOTER_SIZE

const truncated = () => new BpsError('BPS: truncated patch: it ends before its last command')

const corrupt = () => new BpsError('BPS: corrupt patch: its checksum differs')

// The header up to `end`: the whole file to judge a damaged patch, else the start of the footer.
function readHeader(patch: Uint8Array, end: number): Header {
  const reader = new PatchReader(patch, end)
  reader.offset = BPS_MAGIC.length
  const sourceSize = reader.number()
  const targetSize = reader.number()
  reader.take(reader.number())
  return { sourceSize, targetSize, commandsStart: reader.offset, commandsEnd: end }
}

function commandsOf(patch: Uint8Array, header: Header): PatchReader {
  const reader = new PatchReader(patch, header.commandsEnd)
  reader.offset = header.commandsStart
  return reader
}

function readCommand(reader: PatchReader): Command {
  const data = reader.number()
  return { action: (data % 4) as BpsAction, length: Math.floor(data / 4) + 1 }
}

function readOffset(reader: PatchReader): number {
  const data = reader.number()
  const size = Math.floor(data / 2)
  return data % 2 === 1 ? -size : size
}

// Where the commands end when read over the whole file until they fill the target.
function commandsEnd(patch: Uint8Array): number {
  const header = readHeader(patch, patch.length)
  const reader = commandsOf(patch, header)
  let written = 0
  while (written < header.targetSize) {
    const { action, length } = readCommand(reader)
    if (action === BpsAction.TargetRead) reader.take(length)
    if (action === BpsAction.SourceCopy || action === BpsAction.TargetCopy) reader.number()
    written += length
  }
  return reader.offset
}

// Runs once the patch checksum has failed: the patch is truncated when the file ends before its
// commands fill the target or before the footer after them, and corrupt otherwise.
function damage(patch: Uint8Array): BpsError {
  try {
    return commandsEnd(patch) + BPS_FOOTER_SIZE > patch.length ? truncated() : corrupt()
  } catch {
    return truncated()
  }
}

function sourceRead(cursor: Cursor, length: number): void {
  const { source, target, output } = cursor
  if (output + length > source.length) {
    throw new BpsError('BPS: a SourceRead reads past the end of the source')
  }
  target.set(source.subarray(output, output + length), output)
}

function sourceCopy(cursor: Cursor, length: number): void {
  const start = cursor.sourceOffset + readOffset(cursor.reader)
  if (start < 0 || start + length > cursor.source.length) {
    throw new BpsError('BPS: a SourceCopy reads outside the source')
  }
  cursor.target.set(cursor.source.subarray(start, start + length), cursor.output)
  cursor.sourceOffset = start + length
}

// The copy may overlap its own output, which repeats a pattern, so it goes byte by byte.
function targetCopy(cursor: Cursor, length: number): void {
  const start = cursor.targetOffset + readOffset(cursor.reader)
  if (start < 0 || start >= cursor.output) {
    throw new BpsError(
      'BPS: a TargetCopy reads target bytes not yet written or before the start of the target',
    )
  }
  const { target, output } = cursor
  for (let index = 0; index < length; index++)
    target[output + index] = target[start + index] as number
  cursor.targetOffset = start + length
}

function runCommand(cursor: Cursor, { action, length }: Command): void {
  switch (action) {
    case BpsAction.SourceRead:
      sourceRead(cursor, length)
      break
    case BpsAction.TargetRead:
      cursor.target.set(cursor.reader.take(length), cursor.output)
      break
    case BpsAction.SourceCopy:
      sourceCopy(cursor, length)
      break
    case BpsAction.TargetCopy:
      targetCopy(cursor, length)
      break
  }
  cursor.output += length
}

function run(patch: Uint8Array, header: Header, source: Uint8Array): Uint8Array {
  const target = new Uint8Array(header.targetSize)
  const reader = commandsOf(patch, header)
  const cursor: Cursor = { reader, source, target, output: 0, sourceOffset: 0, targetOffset: 0 }
  while (reader.offset < reader.end) {
    const command = readCommand(reader)
    if (command.length > target.length - cursor.output) {
      throw new BpsError(`BPS: a command writes past the target size of ${String(target.length)}`)
    }
    runCommand(cursor, command)
  }
  if (cursor.output !== target.length) {
    const counts = `${String(cursor.output)} of ${String(target.length)}`
    throw new BpsError(`BPS: the commands end after ${counts} target bytes`)
  }
  return target
}

// The patch checksum comes first, so the header and the commands are read only from an intact
// patch, and a damaged one is told apart before any of them can fail.
export function applyBps(patch: Uint8Array, source: Uint8Array): Uint8Array {
  if (!BPS_MAGIC.every((byte, index) => patch[index] === byte)) {
    throw new BpsError('BPS: not a BPS1 patch')
  }
  if (patch.length < MIN_PATCH_SIZE) throw truncated()
  const footer = patch.length - BPS_FOOTER_SIZE
  if (crc32(patch.subarray(0, patch.length - 4)) !== readUint32(patch, footer + 8)) {
    throw damage(patch)
  }
  const header = readHeader(patch, footer)
  if (source.length !== header.sourceSize) {
    const sizes = `it has ${String(source.length)} bytes, the patch expects ${String(header.sourceSize)}`
    throw new BpsError(`BPS: wrong source: ${sizes}`)
  }
  if (crc32(source) !== readUint32(patch, footer)) {
    throw new BpsError(
      'BPS: wrong source: its checksum differs from the one the patch was made from',
    )
  }
  const target = run(patch, header, source)
  if (crc32(target) !== readUint32(patch, footer + 4)) {
    throw new BpsError('BPS: the target checksum differs from the one in the patch')
  }
  return target
}
