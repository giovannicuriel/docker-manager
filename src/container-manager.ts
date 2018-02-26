import { ContainerSet } from "./container";
import { ManagerConfiguration } from "./config";
import { DockerManager } from "./docker-manager";
import { KubernetesManager } from "./kubernetes-manager";

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


class ContainerManagerFactory {
  static create(config: ManagerConfiguration) : ContainerManagerInterface{
    switch (config.engine) {
      case "docker":
        return new DockerManager(config);
      case "kubernetes":
        return new KubernetesManager(config);
    }
  }
}

export { ContainerManagerInterface }
export { ContainerManagerFactory }