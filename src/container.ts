
/**
 * Formal definition of a container
 */
interface Container {
  /** Container name */
  name: string;
  /** Container Docker image */
  image: string;
  /** What should be executed with this container (if any) */
  args: string[];
  /** Container ID - this should not be filled by the user but by docker */
  id?: string;
  /** Flag indicating whether this container is running or not */
  isStarted?: boolean;
}

/**
 * A set of containers
 */
interface ContainerSet {
  /** This container set ID */
  id: string;
  /** A name for this container set */
  name: string;
  /** All containers belonging to this set */
  containers: Container[];
  /** Network ID that serves this set */
  network?: string;
}

export {Container, ContainerSet}