// Ambient types for the surface of `react-native-udp` that
// `src/hooks/useDlnaDiscovery.ts` actually uses (SSDP discovery over a raw
// UDP4 socket). The package ships its own `.d.ts` under `lib/types`, but it
// is not always resolved consistently across our toolchain, so we pin a
// small, accurate surface here instead of `@ts-ignore`-ing the import.
declare module 'react-native-udp' {
  interface UdpRemoteInfo {
    address: string;
    port: number;
    family: string;
  }

  interface UdpSocket {
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'message', listener: (msg: Buffer, rinfo: UdpRemoteInfo) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    bind(port?: number, address?: string, callback?: () => void): void;
    send(
      message: string | Buffer,
      offset: number,
      length: number,
      port: number,
      address: string,
      callback?: (error?: Error) => void
    ): void;
    addMembership(multicastAddress: string, multicastInterface?: string): void;
    address(): UdpRemoteInfo;
    close(callback?: () => void): void;
  }

  interface UdpSocketOptions {
    type: 'udp4' | 'udp6';
    reusePort?: boolean;
    debug?: boolean;
  }

  interface UdpSocketsStatic {
    createSocket(options: UdpSocketOptions): UdpSocket;
  }

  const UdpSockets: UdpSocketsStatic;
  export default UdpSockets;
}
