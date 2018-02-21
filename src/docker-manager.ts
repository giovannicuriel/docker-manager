import docker = require("harbor-master");
import express = require("express");
import { ManagerConfiguration } from "./config";
import { ContainerSet, Container } from "./container";
import util = require("util");
import when = require("when");

var dockerManagerApp = express();

// These classes should be placed in Harbor-Master definitions, not here.
class ContainerModel {
  "Image": string;
  "Cmd": string[];
  "AttachStdin": boolean;
  "AttachStdout": boolean;
  "AttachStderr": boolean;
  "NetworkDisabled": boolean;
  "HostConfig": {
    // "RestartPolicy": {
    //   "Name": "always"
    // };
    "AutoRemove": boolean;
  };
  "NetworkingConfig": {
    "EndpointsConfig": {
      [NetworkName: string]: {
        "Aliases": string[]
      }
    }
  }
  "Tty": boolean;
}

class NetworkModel {
  "Name": string;
  "Internal": boolean;
  "CheckDuplicate": boolean;
}

class NetworkListItemModel {
  "Name": string;
  "Id": string;
  "Created": string;
  "Scope": string;
  "Internal": boolean;;
  "Containers": {
    [ContainerId: string]: {
      "Name": string;
      "IPv4Address": string;
    }
  }
}

class APIResult {
  "Id": string;
  "Warning": string;
}

class APIError {
  "body": string;
  "response": {
    "statusCode": number;
  }
}

class Result {
  "code": number;
  "message": string;
}

/**
 * Interface for docker functions
 */
interface DockerManagerInterface {
  /**
   * Create a new network. 
   * @param networkName Name for the new network.
   * @returns A promise of this operation.
   */
  createNetwork(networkName: string): When.Promise<APIResult>;

  /**
   * Retrieve all network IDs with a particular name.
   * @param networkName The network name to be checked.
   * @returns A promise of this operation.
   */
  getNetworkId(networkName: string) : When.Promise<NetworkListItemModel[]>;

  /**
   * Remove a network. 
   * @param networkName Name for the new network.
   * @param callback The callback to be invoked when everything is finished.
   */
  removeNetwork(networkId: string) : when.Promise<number>;

  /**
   * Create a set of containers.
   * @param containers The list of containers to be created
   * @param networkName The name of the network which will be associated to the
   * new containers.
   * @param callback The callback to be invoked if any error occurs. This
   * callback will be called for each container that was not properly created.
   */
  createContainer(containerSet: ContainerSet, networkName: string): When.Promise<{}>;

  /**
   * Start a container set. 
   * All containers should have a Container ID.
   * @param containerSet The container set to be started
   * @param failure The callback to be invoked when something is not right. This
   * callback will be invoked for each container which has a problem.
   * @param finished The callback to be invoked when all containers were 
   * started.
   */
  startContainer(containerSet: ContainerSet): When.Promise<{}>;

  /**
   * Kill a container set. 
   * All containers should have a Container ID.
   * @param containerSet The container set to be killed
   * @param failure The callback to be invoked when something is not right. This
   * callback will be invoked for each container which has a problem.
   * @param finished The callback to be invoked when all containers were 
   * killed.
   */
  killContainer(containerSet: ContainerSet): When.Promise<{}>;

  /**
   * Setup and run a container set. 
   * Create the necessary network, create containers and start all of them.
   * @param containerSet The container set to be started
   * @param networkFailure A callback to be invoked when there is a network
   * configuration failure. If this callback is used, then no further action
   * is taken.
   * @param createFailure A callback to be invoked when there is a problem
   * while creating the containers. If this callback is used, then no container
   * is started.
   * @param startFailure A callback to be invoked when there is a problem
   * while starting the containers. 
   * @param finished A callback to be invoked then there is no further action
   * to be taken. This could be: if there was a problem while creating the
   * network or containers, while starting them up or after successfully
   * creating and starting all of them.
   */
  setupAndRunContainerSet(containerSet: ContainerSet, networkName: string): When.Promise<ContainerSet>;

  /**
   * Kill and remove a container set. 
   * Kill all containers, remove them and their network
   * @param containerSet The container set to be started
   * @param killFailure A callback to be invoked when there is a problem
   * while killing the containers. If this callback is used, then no container
   * is started.
   * @param removeFailure A callback to be invoked when there is a problem
   * while removing the containers. 
   * @param networkFailure A callback to be invoked when there is a network
   * configuration failure. If this callback is used, then no further action
   * is taken.
   * @param finished A callback to be invoked then there is no further action
   * to be taken. This could be: if there was a problem while killing or 
   * removing containers or during network removal. Also, it is called when
   * everything is removed successfully.
   */
  killAndRemoveContainerSet(containerSetId: string): When.Promise<number>;
}


/**
 * Implementation of DockerManagerEndpointsInterface using express library
 */
class DockerManager implements DockerManagerInterface {
  private port: number;
  private dockerClient: any;
  private containerSetCache: {
    [containerId: string]: ContainerSet
  }

  /**
   * Constructor
   * @param config The configuration to be used
   */
  constructor(config: ManagerConfiguration) {
    this.port = config.port;
    let dockerConfig: any = {};
    this.containerSetCache = {};
    switch (config.docker.type) {
      case "socket":
        if (config.docker.socket) {
          dockerConfig["socket"] = config.docker.socket;
        } else {
          // Throw exception or return error
        }
        break;
      case "swarm":
        if (config.docker.swarm) {
          dockerConfig["host"] = config.docker.swarm.host;
          dockerConfig["port"] = config.docker.swarm.port;
        } else {
          // Throw exception or return error
        }
        break;
    }
    // This might not be defined, but that's ok.
    dockerConfig["tls"] = config.docker.tls;

    this.dockerClient = docker.Client(dockerConfig);
  }

  createNetwork(networkName: string): When.Promise<APIResult> {
    let options = {}
    let model: NetworkModel = {
      Name: networkName,
      Internal: false,
      CheckDuplicate: false
    }
    console.log("Creating network " + networkName + "...");
    return this.dockerClient.networks().create(model, options);
  }

  getNetworkId(networkName: string) : When.Promise<NetworkListItemModel[]> {
    let options = {
      filters: "name=" + networkName
    }
    return this.dockerClient.networks().list(options);
  }

  removeNetwork(networkId: string) : when.Promise<number> {
    let options = {}
    console.log("Removing network " + networkId + "...");
    return this.dockerClient.networks().remove(networkId).then((value: any) => {
      // Removing any parameter
      return 0;
    });
  }


  // TODO check whether type is right
  createContainer(containerSet: ContainerSet, networkName: string): When.Promise<Container[]> {
    let containerCreationPromises: when.Promise<{}>[] = [];
    let options = {
      "name": ""
    }

    let finishedContainers = 0;

    let model = new ContainerModel();
    model.AttachStdin = false;
    model.AttachStdout = false;
    model.AttachStderr = true;
    model.NetworkDisabled = false;
    model.HostConfig = {
      AutoRemove: true
    }
    model.Tty = true;
    model.NetworkingConfig = {
      EndpointsConfig: {}
    }

    for (let container of containerSet.containers) {
      options.name = container.name;
      model.Image = container.image;
      model.Cmd = container.args;

      model.NetworkingConfig.EndpointsConfig[networkName] = {
        Aliases: [container.name]
      }

      console.log("Creating container " + container.name + "...");
      let promise = this.dockerClient.containers().create(model, options, null).then((result: APIResult) => {
        console.log("... container was created. ID is " + result.Id);
        container.isStarted = false;
        container.id = result.Id;
        return container;
      }, (error: APIError) => {
        console.log("... container was not created.");
        console.log("Returned status code: " + error.response.statusCode);
        console.log("Returned message: " + util.inspect(error.body, { depth: null }));
        return container;
      });
      containerCreationPromises.push(promise);
    }
    return when.all(containerCreationPromises);
  }

  startContainer(containerSet: ContainerSet): When.Promise<Container[]> {
    let containerPromises: When.Promise<{}>[] = [];
    for (let container of containerSet.containers) {
      console.log("Starting container " + container.name + "(ID " + container.id + ")...")
      let promise = this.dockerClient.containers().start(container.id).then((result: APIResult) => {
        console.log("... container " + container.id + " was started.");
        container.isStarted = true;
        return container;
      }, (error: APIError) => {
        if (error.response.statusCode != 204) {
          console.log("... container " + container.id + " was not started.");
          console.log("Returned status code: " + error.response.statusCode);
          console.log("Returned message: " + util.inspect(error.body, { depth: null }));
        }
        return container;
      });
      containerPromises.push(promise);
    }
    return when.all(containerPromises);
  }

  killContainer(containerSet: ContainerSet): When.Promise<Container[]> {
    let containerPromises: When.Promise<Container>[] = [];
    for (let container of containerSet.containers) {
      if (container.id == undefined) {
        console.log("Container " + container.name + " has no ID. Skipping it.");
        continue;
      }

      console.log("Killing container " + container.name + "(ID " + container.id + ")...");
      let promise = this.dockerClient.containers().kill(container.id).then((result: APIResult) => {
        console.log("... container was killed.");
        container.isStarted = false;
        return container;
      }, (error: APIError) => {
        console.log("... container was not killed (supposedly).");
        console.log("Returned status code: " + error.response.statusCode);
        if (error.response.statusCode != 204) {
          console.log("... container was not killed.");
          console.log("Returned status code: " + error.response.statusCode);
          console.log("Returned message: " + util.inspect(error.body, { depth: null }));
        }
        return container;
      });
      containerPromises.push(promise);
    }
    return when.all(containerPromises);
  }

  setupAndRunContainerSet(containerSet: ContainerSet, networkName: string): When.Promise<ContainerSet> {
    return when.promise((resolve, reject) => {
      console.log("Configuring container set " + containerSet.name + "...");
      console.log("Full configuration:");
      console.log(util.inspect(containerSet, {depth:null}))

      let startContainerResolve = (value: Container[]) => {
        console.log("... container set was configured.");
        resolve(containerSet);
      }

      let startContainerError = (error: APIError) => {
        console.log("... container set was started.");
        console.log("Error is " + util.inspect(error, {depth: null}));
        reject("Container was not started.");
      }

      let createContainerResolve = (value: Container[]) => {
        this.startContainer(containerSet).done(startContainerResolve, startContainerError);
      }

      let createContainerError = (error: APIError) => {
        console.log("... container set was not fully configured.");
        console.log("Error is " + util.inspect(error, {depth: null}));
        reject("Container was not initialized.");
      }

      let createNetworkResolve = (value: APIResult) => {
        containerSet.network = value.Id;
        this.createContainer(containerSet, value.Id).done(createContainerResolve, createContainerError);
      }

      let createNetworkError = (error: APIError) => {
        console.log("... can't create new network.");
        console.log("Error is " + util.inspect(error, {depth: null}));
        reject("Can't create network " + networkName);
      }

      let getNetworkIdResolve = (value: NetworkListItemModel[]) => {
        if (value.length == 1) {
          this.createContainer(containerSet, value[0].Id).done(createContainerResolve, createContainerError);
        } else {
          console.log("... more than one network with same name.");
          reject("More than one network with same name " + networkName);
        }
      }
      let getNetworkIdError = (error: APIError) => {
        console.log("... network does not yet exist.");
        console.log("Error is " + util.inspect(error, {depth: null}));
        console.log("Creating a new one.");
        this.createNetwork(networkName).done(createNetworkResolve, createNetworkError);
      }

      this.containerSetCache[containerSet.id] = containerSet;
      this.getNetworkId(networkName).done(getNetworkIdResolve, getNetworkIdError);
    });
  }

  killAndRemoveContainerSet(containerSetId: string): When.Promise<number> {
    return when.promise((resolve, reject) => {
    // Sanity checks
    if (!(containerSetId in this.containerSetCache)) {
      reject("There is no container set with ID " + containerSetId);
    }
    // End of sanity checks
    
    let containerSet = this.containerSetCache[containerSetId];

    console.log("Killing and removing container set " + containerSet.name + "...");

    let removeNetworkResolve = (value: any) => {
      console.log("... container set was killed and removed.");
      resolve(0);
    }

    let removeNetworkError = (error: APIError) => {
      console.log("... can't remove network.");
      console.log("Error is " + util.inspect(error, {depth: null}));
      reject("Can't remove network " + containerSet.network);
    }

    let killContainerResolve = (value: any) => {
      console.log("... all containers were killed.");
      if (containerSet.network != undefined) {
        this.removeNetwork(containerSet.network).done(removeNetworkResolve, removeNetworkError);
      } else {
        console.log("There is no network to be removed.");
        resolve(0);
      }
    }

    let killContainerError = (error: APIError) => {
      console.log("... can't kill container.");
      console.log("Error is " + util.inspect(error, {depth: null}));
      reject("Can't kill container.");
    }

    this.killContainer(containerSet).done(killContainerResolve, killContainerError);
  });
  }
}

export { DockerManagerInterface }
export { DockerManager }