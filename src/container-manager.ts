import { ContainerSet } from "./container";

/**
 * Interface for docker functions
 */
interface ContainerManagerInterface {
  /**
   * Setup and run a container set. 
   * Create the necessary network, create containers and start all of them.
   */
  setupAndRunContainerSet(containerSet: ContainerSet, namespace: string): When.Promise<ContainerSet>;

  /**
   * Kill and remove a container set. 
   * Kill all containers and remove any pending resource related to them.
   */
  killAndRemoveContainerSet(containerSetId: string): When.Promise<number>;
}


export { ContainerManagerInterface }