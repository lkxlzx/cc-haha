import { arch } from 'node:os'

const NODE_TO_HOST_ARCH: Readonly<Record<string, string>> = {
  arm: 'arm32',
  ppc: 'ppc32',
  x64: 'amd64',
}

export function normalizeHostArch(nodeArch = arch()): string {
  return NODE_TO_HOST_ARCH[nodeArch] ?? nodeArch
}
