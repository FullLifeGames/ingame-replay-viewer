// How the rom:* commands end: the message, its cause on a line of its own, and exit code 1.
export function errorText(command: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const cause =
    error instanceof Error && error.cause instanceof Error ? `${error.cause.message}\n` : ''
  return `${command}: ${message}\n${cause}`
}

export function runCli(command: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    process.stderr.write(errorText(command, error))
    process.exitCode = 1
  }
}
