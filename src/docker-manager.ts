import docker = require("harbor-master");
import express = require("express");
import { ManagerConfiguration } from "./config";
import { ContainerSet, Container } from "./container";
import util = require("util");
import when = require("when");
import { ContainerManagerInterface } from "./container-manager";

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
 * Implementation of DockerManagerEndpointsInterface using express library
 */
class DockerManager implements ContainerManagerInterface {
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

      if (containerSet.id in this.containerSetCache) {
        this.containerSetCache[containerSet.id].containers = this.containerSetCache[containerSet.id].containers.concat(containerSet.containers);
      } else {
        this.containerSetCache[containerSet.id] = containerSet;
      }
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

export { ContainerManagerInterface }
export { DockerManager }