
/**
 * Configuration for Docker Swarm access mode.
 */
interface DockerSwarmConfiguration {
  /** Swarm host */
  host: string;
  /** Swarm network port */
  port: number;
}

/**
 * Configuration for Docker TLS access
 */
interface TLSConfiguration { 
  /** CA certificate (filename) */
  ca: string;
  /** Entity certificate (filename) */
  cert: string;
  /** Entity key (filename) */
  key: string;
  /** Key passphrase (if needed) */
  passphrase: string;
}


interface KubernetesConfiguration {
  url: string;
  version?: string;
  tls?: TLSConfiguration
}

/**
 * Configuration for Docker Remote API access
 */
interface DockerAPIConfiguration {
  /** API access type */
  type: "socket" | "swarm";
  /** If type is 'socket', this is local socket path */
  socket?: string;

  /** If type is 'swarm', this is its configuration */
  swarm?: DockerSwarmConfiguration;

  /** If TLS is needed, this is its configuration */
  tls?: TLSConfiguration;
}

interface ManagerConfiguration {
  /** Network port on which this manager will listen for requests. */
  port: number;

  /** Engine */
  engine: "docker" | "kubernetes";

  /** Docker remote API configuration */
  docker?: DockerAPIConfiguration;

  /** Kubernetes API configuration */
  kubernetes?: KubernetesConfiguration;
}

export { ManagerConfiguration }