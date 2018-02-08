import docker = require("harbor-master");
import express = require("express");
import { ManagerConfiguration } from "./config";
import { ContainerSet, Container } from "./container";
import util = require("util")

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
   * @param callback The callback to be invoked when everything is finished.
   */
  createNetwork(networkName: string, callback: (id: string, error: string) => void): void;

  /**
   * Retrieve all network IDs with a particular name.
   * @param networkName The network name to be checked
   * @param callback The callback to be invoked when the network list is 
   * retrieved.
   */
  getNetworkId(networkName: string, callback: (networkIds: string[], error: string) => void) : void;

  /**
   * Remove a network. 
   * @param networkName Name for the new network.
   * @param callback The callback to be invoked when everything is finished.
   */
  removeNetwork(networkId: string, callback: (id: string, error: string) => void): void;

  /**
   * Create a set of containers.
   * @param containers The list of containers to be created
   * @param networkName The name of the network which will be associated to the
   * new containers.
   * @param callback The callback to be invoked if any error occurs. This
   * callback will be called for each container that was not properly created.
   */
  createContainer(containerSet: ContainerSet, networkName: string,
    failure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): void;

  /**
   * Start a container set. 
   * All containers should have a Container ID.
   * @param containerSet The container set to be started
   * @param failure The callback to be invoked when something is not right. This
   * callback will be invoked for each container which has a problem.
   * @param finished The callback to be invoked when all containers were 
   * started.
   */
  startContainer(containerSet: ContainerSet,
    failure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): void

  /**
   * Kill a container set. 
   * All containers should have a Container ID.
   * @param containerSet The container set to be killed
   * @param failure The callback to be invoked when something is not right. This
   * callback will be invoked for each container which has a problem.
   * @param finished The callback to be invoked when all containers were 
   * killed.
   */
  killContainer(containerSet: ContainerSet,
    failure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): void

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
  setupAndRunContainerSet(containerSet: ContainerSet, networkName: string,
    networkFailure: (networkName: string, error: string) => void,
    createFailure: (container: Container, error: string) => void,
    startFailure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): Result;

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
  killAndRemoveContainerSet(containerSetId: string,
    killFailure: (container: Container, error: string) => void,
    networkFailure: (networkName: string, error: string) => void,
    finished: () => void): Result;
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

  createNetwork(networkName: string, callback: (id: string, error: string) => void): void {
    let options = {}
    let model: NetworkModel = {
      Name: networkName,
      Internal: false,
      CheckDuplicate: false
    }
    console.log("Creating network " + networkName + "...");
    this.dockerClient.networks().create(model, options).then((networkData: APIResult) => {
      console.log("... network was created.");
      callback(networkData.Id, "");
    }).catch((error: APIError) => {
      console.log("... network was not created.");
      if (error.response){
      console.log("Returned status code: " + error.response.statusCode);}
      console.log("Returned message: " + util.inspect(error.body, { depth: null }));
      callback("", error.body);
    });
  }

  getNetworkId(networkName: string, callback: (networkIds: string[], error: string) => void) : void {
    let options = {
      filters: "name=" + networkName
    }
    this.dockerClient.networks().list(options).then((networkList: NetworkListItemModel[]) =>  { 
      let networkIds: string[] = [];
      for (let networkItem of networkList) {
        networkIds.push(networkItem.Id);
      }
      callback(networkIds, "");
    }).catch((error: APIError) => {
      callback([], error.body);
    })
  }

  removeNetwork(networkId: string, callback: (networkId: string, message: string) => void): void {
    let options = {}
    console.log("Removing network " + networkId + "...");
    this.dockerClient.networks().remove(networkId).then((error: APIError) => {
      console.log("... network was removed.");
      callback(networkId, "");
    }).catch((error: APIError) => {
      console.log("... network was not removed.");
      console.log("Returned status code: " + error.response.statusCode);
      console.log("Returned message: " + util.inspect(error.body, { depth: null }));
      callback("", error.body);
    });
  }

  createContainer(containerSet: ContainerSet, networkName: string,
    failure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): void {

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

      console.log("Creating container " + container.name + "...")
      this.dockerClient.containers().create(model, options, null).then((result: APIResult) => {
        console.log("... container created (ID " + result.Id + ").");
        container.isStarted = false;
        container.id = result.Id;
        finishedContainers++;
        if (finishedContainers == containerSet.containers.length) {
          finished(containerSet);
        }
      }).catch((error: APIError) => {
        console.log("... container was not created.");
        console.log("Returned status code: " + error.response.statusCode);
        console.log("Returned message: " + util.inspect(error.body, { depth: null }));
        finishedContainers++;
        failure(container, error.body);
        if (finishedContainers == containerSet.containers.length) {
          finished(containerSet);
        }
      });

    }
  }

  startContainer(containerSet: ContainerSet,
    failure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): void {

    let finishedContainers = 0;
    for (let container of containerSet.containers) {
      console.log("Starting container " + container.name + "(ID " + container.id + ")...")
      this.dockerClient.containers().start(container.id).then((result: APIResult) => {
        console.log("... container was started.");
        container.isStarted = true;
        finishedContainers++;
        if (finishedContainers == containerSet.containers.length) {
          finished(containerSet);
        }
      }).catch((error: APIError) => {
        finishedContainers++;
        if (error.response.statusCode != 204) {
          console.log("... container was not started.");
          console.log("Returned status code: " + error.response.statusCode);
          console.log("Returned message: " + util.inspect(error.body, { depth: null }));
          failure(container, error.body);
        }
        if (finishedContainers == containerSet.containers.length) {
          finished(containerSet);
        }
      });
    }
  }

  killContainer(containerSet: ContainerSet,
    failure: (container: Container, error: string) => void,
    finished: (containers: ContainerSet) => void): void {

    let finishedContainers = 0;
    for (let container of containerSet.containers) {
      if (container.id == undefined) {
        console.log("Container " + container.name + " has no ID. Skipping it.");
        continue;
      }

      console.log("Killing container " + container.name + "(ID " + container.id + ")...");
      this.dockerClient.containers().kill(container.id).then((result: APIResult) => {
        console.log("... container killed.");
        container.isStarted = false;
        finishedContainers++;
        if (finishedContainers == containerSet.containers.length) {
          finished(containerSet);
        }
      }).catch((error: APIError) => {
        finishedContainers++;
        if (error.response.statusCode != 204) {
          console.log("... container was not killed.");
          console.log("Returned status code: " + error.response.statusCode);
          console.log("Returned message: " + util.inspect(error.body, { depth: null }));
          failure(container, error.body);
        }
        if (finishedContainers == containerSet.containers.length) {
          finished(containerSet);
        }
      });
    }
  }

  setupAndRunContainerSet(containerSet: ContainerSet, networkName: string,
    userCreateNetworkFailureCbk: (networkName: string, error: string) => void,
    userCreateContainerFailureCbk: (container: Container, error: string) => void,
    userStartContainerFailureCbk: (container: Container, error: string) => void,
    userFinishedCbk: (containers: ContainerSet) => void): Result {

    let ret: Result = {
      code: 201,
      message: "ok"
    };

    console.log("Configuring container set " + containerSet.name + "...");
    console.log("Full configuration:");
    console.log(util.inspect(containerSet, {depth:null}))
    let failedContainers: string[] = [];

    let createContainerFailureCbk = (container: Container, error: string) => {
      failedContainers.push(container.name);
      userCreateContainerFailureCbk(container, error);
    }

    let startContainerFailureCbk = (container: Container, error: string) => {
      failedContainers.push(container.name);
      userStartContainerFailureCbk(container, error);
    }

    let startContainerCbk = (containers: ContainerSet) => {
      console.log("... container set was configured.");
      userFinishedCbk(containers);
    }

    let createContainerCbk = (containers: ContainerSet) => {
      if (failedContainers.length != 0) {
        console.log("... container set was not fully configured.");
        userFinishedCbk(containers);
      } else {
        this.startContainer(containers, startContainerFailureCbk,
          startContainerCbk);
      }
    }

    let createNetworkCbk = (networkId: string, error: string) => {
      if (error != "") {
        console.log("... container set was not fully configured.");
        userCreateNetworkFailureCbk(networkId, error);
        userFinishedCbk(containerSet);
      } else {
        containerSet.network = networkId;
        this.createContainer(containerSet, networkId,
          createContainerFailureCbk, createContainerCbk);
      }
    }

    let getNetworkIdsCbk = (networkIds: string[], error: string) => {
      if (error == "") {
        // Network exists
        if (networkIds.length == 1) {
          this.createContainer(containerSet, networkIds[0],
            createContainerFailureCbk, createContainerCbk);
        } else {
          userCreateNetworkFailureCbk(networkName, "More than one network with this name.")
          userFinishedCbk(containerSet);
          return ret;
        }
      } else {
        // Network doesn't exist
        this.createNetwork(networkName, createNetworkCbk);
      }
    }

    this.getNetworkId(networkName, getNetworkIdsCbk);
    this.containerSetCache[containerSet.id] = containerSet;
    return ret;
  }

  killAndRemoveContainerSet(containerSetId: string,
    userkillFailureCbk: (container: Container, error: string) => void,
    userNetworkFailureCbk: (networkName: string, error: string) => void,
    userFinishedCbk: () => void): Result {

    let ret: Result = {
      code: 201,
      message: "ok"
    };
   
    // Sanity checks
    if (!(containerSetId in this.containerSetCache)) {
      ret.code = 404;
      ret.message = "There is no container set with this ID";
      return ret;
    }
    // End of sanity checks
    
    let failedContainers: string[] = [];
    let containerSet = this.containerSetCache[containerSetId];

    console.log("Killing and removing container set " + containerSet.name + "...");

    let killContainerFailureCbk = (container: Container, error: string) => {
      failedContainers.push(container.name);
      userkillFailureCbk(container, error);
    }

    let removeNetworkCbk = (networkId: string, message: string) => {
      if (message != "") {
        userNetworkFailureCbk(networkId, message);
      }
      console.log("... container set was killed and removed.");
      userFinishedCbk();
    }

    let killContainerCbk = (containers: ContainerSet) => {
      if (failedContainers.length != 0) {
        console.log("... container set was not fully killed and removed.");
        userFinishedCbk();
      } else {
        if (containerSet.network != undefined) {
          this.removeNetwork(containerSet.network, removeNetworkCbk);
        }
      }
    }

    this.killContainer(containerSet, killContainerFailureCbk, killContainerCbk);
    return ret;
  }
}

export { DockerManagerInterface }
export { DockerManager }